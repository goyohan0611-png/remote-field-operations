namespace Fieldlink.SiteAgent;

public static class AgentRuntime
{
    public static Uri NormalizeServerUrl(string value)
    {
        if (!Uri.TryCreate(value.Trim().TrimEnd('/'), UriKind.Absolute, out var uri))
        {
            throw new ArgumentException("중앙 서버 주소 형식이 올바르지 않습니다.");
        }

        var isLocalDevelopment = uri.IsLoopback && uri.Scheme == Uri.UriSchemeHttp;
        if (uri.Scheme != Uri.UriSchemeHttps && !isLocalDevelopment)
        {
            throw new ArgumentException("중앙 서버는 HTTPS 주소여야 합니다.");
        }

        return uri;
    }

    public static TimeSpan GetHeartbeatDelay(int seconds, Random random)
    {
        var safeSeconds = Math.Clamp(seconds, 15, 300);
        var jitter = random.NextDouble() * Math.Min(5, safeSeconds * 0.1);
        return TimeSpan.FromSeconds(safeSeconds + jitter);
    }

    public static TimeSpan GetRetryDelay(int consecutiveFailures, Random random)
    {
        var exponent = Math.Clamp(consecutiveFailures - 1, 0, 6);
        var seconds = Math.Min(300, 5 * Math.Pow(2, exponent));
        return TimeSpan.FromSeconds(seconds * (1 + random.NextDouble() * 0.2));
    }
}
