using System.Net.Http.Json;
using Fieldlink.SiteAgent;

if (args.Contains("--self-test"))
{
    // 핵심 재시도·URL 정책은 네트워크 없이 검증한다.
    if (AgentRuntime.GetHeartbeatDelay(1, new Random(1)).TotalSeconds < 15) throw new Exception("heartbeat_delay");
    if (AgentRuntime.GetRetryDelay(20, new Random(1)).TotalSeconds > 360) throw new Exception("retry_delay");
    if (!AgentRuntime.NormalizeServerUrl("http://127.0.0.1:4177").IsLoopback) throw new Exception("loopback_url");
    try { AgentRuntime.NormalizeServerUrl("http://example.invalid"); throw new Exception("HTTPS 정책 오류"); }
    catch (ArgumentException) { }
    Console.WriteLine("에이전트 핵심 정책 검사 4개 성공 · 네트워크 요청 없음");
    return;
}

// 설치·장비 검색·파일 접근 없이 합성 상태만 고정된 로컬 데모 서버에 전송한다.
using var shutdown = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; shutdown.Cancel(); };
using var client = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:4177"), Timeout = TimeSpan.FromSeconds(10) };
var once = args.Contains("--once");
var failures = 0;
do
{
    try
    {
        var health = new AgentLocalStatus(new AgentDeviceChecks("online", "online", "online", "online", "online", "online"),
            IsRecording: true, HddUsedPct: 42.5, MeasuredAt: DateTimeOffset.UtcNow);
        using var response = await client.PostAsJsonAsync("/api/demo/heartbeat", new { siteId = "1", health }, shutdown.Token);
        response.EnsureSuccessStatusCode();
        Console.WriteLine("[DEMO] 가상 현장 1 상태 전송 완료 · 실장비 접근 없음");
        failures = 0;
        if (!once) await Task.Delay(AgentRuntime.GetHeartbeatDelay(15, Random.Shared), shutdown.Token);
    }
    catch (OperationCanceledException) when (shutdown.IsCancellationRequested) { break; }
    catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
    {
        Console.Error.WriteLine("로컬 데모 서버에 연결하지 못했습니다. demo:server 실행 여부를 확인하세요.");
        if (once) { Environment.ExitCode = 1; break; }
        try { await Task.Delay(AgentRuntime.GetRetryDelay(++failures, Random.Shared), shutdown.Token); }
        catch (OperationCanceledException) { break; }
    }
} while (!once && !shutdown.IsCancellationRequested);
