using System.Security.Cryptography;
using System.Text;

namespace Fieldlink.SiteAgent;

public sealed class RecordingTail
{
    public string Day { get; set; } = "";
    public long Position { get; set; }
    public string Anchor { get; set; } = "";
    public string EncodingName { get; set; } = "utf-8";
    public bool Gap { get; set; }

    public async Task<string[]> ReadAsync(string root, DateTime now, CancellationToken token)
    {
        var day = now.ToString("yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture);
        var first = Day.Length == 0;
        if (day != Day) { Day = day; Position = 0; Anchor = ""; }
        var path = Path.Combine(root, "log" + Day + ".log");
        if (!File.Exists(path)) return [];
        for (var current = Path.GetFullPath(path); !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new IOException("reparse_path");
        await using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 8192, true);
        var bom = new byte[Math.Min(3, file.Length)];
        await file.ReadExactlyAsync(bom, token);
        EncodingName = bom.Length >= 2 && bom[0] == 0xff && bom[1] == 0xfe ? "utf-16"
            : bom.Length >= 2 && bom[0] == 0xfe && bom[1] == 0xff ? "utf-16BE" : "utf-8";
        var changed = Position > file.Length || (Anchor.Length > 0 && await HashAnchor(file, Position, token) != Anchor);
        if (first || changed)
        {
            Gap |= changed; Position = file.Length; Anchor = await HashAnchor(file, Position, token); return [];
        }
        file.Position = Position;
        var bytes = new byte[(int)Math.Min(1024 * 1024, file.Length - Position)];
        await file.ReadExactlyAsync(bytes, token);
        var end = 0;
        for (var i = 0; i < bytes.Length; i++)
        {
            if (EncodingName == "utf-8" && bytes[i] == 10) end = i + 1;
            if (EncodingName == "utf-16" && i % 2 == 0 && i + 1 < bytes.Length && bytes[i] == 10 && bytes[i + 1] == 0) end = i + 2;
            if (EncodingName == "utf-16BE" && i % 2 == 0 && i + 1 < bytes.Length && bytes[i] == 0 && bytes[i + 1] == 10) end = i + 2;
        }
        if (end == 0 && bytes.Length == 1024 * 1024) throw new IOException("line_too_large");
        var encoding = Encoding.GetEncoding(EncodingName, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
        var text = encoding.GetString(bytes, 0, end).TrimStart('\ufeff');
        Position += end; Anchor = await HashAnchor(file, Position, token);
        return text.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(line => line.TrimEnd('\r')).ToArray();
    }

    private static async Task<string> HashAnchor(FileStream file, long position, CancellationToken token)
    {
        if (position > file.Length) return "changed";
        var length = (int)Math.Min(128, position);
        file.Position = position - length;
        var bytes = new byte[length]; await file.ReadExactlyAsync(bytes, token);
        return Convert.ToHexString(SHA256.HashData(bytes));
    }
}

public sealed class RecorderTail
{
    public string[]? Anchor { get; set; }
    public bool Gap { get; set; }
    public string[] Append(string snapshot)
    {
        var lines = snapshot.Split('\n');
        // 미완성 마지막 줄은 다음 스냅샷까지 보류한다.
        lines = lines[..^1];
        var hashes = lines.Select(line => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(line)))).ToArray();
        var start = lines.Length;
        if (Anchor is { Length: > 0 })
        {
            var matches = new List<int>();
            for (var i = 0; i + Anchor.Length <= hashes.Length; i++)
                if (hashes.AsSpan(i, Anchor.Length).SequenceEqual(Anchor)) matches.Add(i + Anchor.Length);
            if (matches.Count == 1) start = matches[0]; else Gap = true;
        }
        else if (Anchor is not null) start = 0;
        Anchor = hashes.TakeLast(16).ToArray();
        return lines[start..];
    }
}
