namespace Fieldlink.SiteAgent;

public sealed record AgentConfiguration(
    string ServerUrl,
    string AgentId,
    string SiteId,
    string Token,
    string? TunnelHostname = null,
    string? TunnelAdvertiseRoute = null,
    string CameraType = "g320");

public sealed record AgentIdentity(
    string MachineId,
    string Hostname,
    string Version,
    string? LocalIp,
    string BootId);

public sealed record AgentTunnelStatus(
    string State,
    string? Ipv4,
    string? Ipv6);

public sealed record AgentDeviceChecks(
    string Nvr,
    string Rtsp,
    string Ftp,
    string Ssh,
    string Rdp,
    string Cam);

public sealed record AgentLocalStatus(
    AgentDeviceChecks Checks,
    bool? IsRecording = null,
    double? HddUsedPct = null,
    string? FirmwareVersion = null,
    string? RecorderTime = null,
    int? RecorderTimeDiff = null,
    DateTimeOffset? MeasuredAt = null);

public sealed record AgentShutdownSettings(bool Enabled, string? StartTime);
public sealed record AgentCloudSettings(bool Enabled, string? OrgCode);
public sealed record AgentSiteSettings(AgentShutdownSettings? Shutdown, AgentCloudSettings? Cloud);

public sealed record AgentCommandResponse(string Command, string? RequestId = null);

public sealed record EnrollmentRequest(
    string Code,
    string Edition,
    string MachineId,
    string Hostname,
    string Version,
    string? LocalIp,
    string BootId);

public sealed record EnrollmentResponse(
    string AgentId,
    string SiteId,
    string Token,
    int HeartbeatIntervalSeconds);

public sealed record HeartbeatRequest(
    string Edition,
    string MachineId,
    string Hostname,
    string Version,
    string? LocalIp,
    string BootId,
    AgentTunnelStatus Tunnel,
    AgentLocalStatus? Health,
    string? RefreshRequestId = null,
    bool UpdaterImmediateSupported = false,
    AgentSiteSettings? SiteSettings = null);

public sealed record HeartbeatResponse(
    bool Ok,
    string? ObservedPublicIp,
    bool PublicIpTrusted,
    bool IpChanged,
    int HeartbeatIntervalSeconds,
    string? AdvertiseRoute,
    string CameraType = "g320");

public sealed record TunnelBootstrapResponse(
    string AuthKey,
    string Hostname,
    string Tag,
    string? AdvertiseRoute,
    string CameraType = "g320");

public sealed record TunnelConfigurationResponse(
    string Hostname,
    string Tag,
    string? AdvertiseRoute,
    string CameraType = "g320");
