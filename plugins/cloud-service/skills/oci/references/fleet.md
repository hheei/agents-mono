# Fleet map

Ownership and intended roles for the owner's OCI tenancies. Revalidate
lifecycle, public IPs, volume size, and SSH before every mutation. Do not treat
this file as a live `oci` dump.

SSH aliases in `~/.ssh/config` are the guest index. Profile names in
`~/.oci/config` are the API index. When they disagree, stop mutating and
reconcile.

## Tenancies

Two Always Free accounts. They do not share quota, images, VCNs, or API keys.

| Profile | Home region | Region key | SSH guests | Notes |
| --- | --- | --- | --- | --- |
| `DEFAULT` | `ap-singapore-2` | not Chuncheon | `oracle-sg` | Only this region is subscribed |
| `KR` | `ap-chuncheon-1` | `YNY` | `oracle-kr` | Home region; `ap-seoul-1` is not subscribed |

Compartment for current inventory is each tenancy root (`tenancy=` in the
profile). Discover user OCIDs from the profile; do not duplicate them here.

CLI config and keys live only on the owner's Mac under `~/.oci/` (`config`,
`sg.pem`, `kr.pem`, matching `*_public.pem`). Guests do not run `oci`.

## Singapore (`DEFAULT`)

| Field | Convention |
| --- | --- |
| SSH | `oracle-sg` |
| Display name | `4c24g` |
| Shape | `VM.Standard.A1.Flex` (4 OCPU / 24 GB) |
| AD | `YYmi:AP-SINGAPORE-2-AD-1` |
| Boot volume | 200 GB, VPUs 10, auto-tune off — uses the full free 200 GB |
| Guest user | `ubuntu` |
| Role | Independent A1 box |

Guest hostname may be `4c24g-vnic`. That string is not unique across tenancies;
identify by SSH alias or instance OCID.

## Korea (`KR`)

Always Free compute here is one A1 flex (4 OCPU / 24 GB). Always Free block
storage is 200 GB for the whole tenancy and is used by this A1 boot.

| Field | Convention |
| --- | --- |
| SSH | `oracle-kr` |
| Display name | `oracle-kr` |
| Shape | `VM.Standard.A1.Flex` (4 OCPU / 24 GB) |
| AD | `CFdC:AP-CHUNCHEON-1-AD-1` |
| Private network | `10.1.22.0/24` family |
| Boot volume | 200 GB, VPUs 10, auto-tune off |
| Guest `/` layout | Ubuntu GPT: `sda15` ESP, `sda13` `/boot`, `sda1` `/` last |
| Guest user | `ubuntu` |
| SSH key | `~/.ssh/oracle-kr.key` |
| Arch / OS | `aarch64` Ubuntu 26.04 |
| Role | Production Korea guest: CPA + VLESS `kr.link.hheei.cc` |

Guest hostname may be `4c24g-vnic`; identify by SSH alias or instance OCID.

### Ownership

| Guest service | Owner |
| --- | --- |
| sing-box (VLESS :443, mixed :7892, embedded Tailscale) | `oracle-kr`; Reality dest `www.snu.ac.kr`; public hostname `kr.link.hheei.cc`; Tailscale hostname `oracle-kr` |
| CLIProxyAPI | `oracle-kr` `/opt/cliproxyapi/` plus `cliproxyapi.service` / `cliproxyapi-update.timer` |

Guest INPUT (persisted in `/etc/iptables/rules.v4`): 22/tcp, 443/tcp, 41641/udp,
then REJECT. systemd-resolved DNS is loopback-only (`127.0.0.53` / `127.0.0.54`).
No public STUN/TURN/WebRTC listener. Mixed proxy `:7892` listens on `0.0.0.0`
but is rejected at INPUT.

IPv6: Korea VCN `mushop-main-iIUf` has Oracle GUA `2603:c024:1a:7a00::/56`.
The shared subnet `mushop-lb-iIUf` has `2603:c024:1a:7a00::/64`, `::/0` via the
existing internet gateway, and IPv6 security-list ingress for ICMPv6 / 22 / 443
plus egress `::/0`. That `/56` cannot be removed once added. Guest policy on
`oracle-kr`: **no public IPv6 egress**. `/etc/netplan/99-ipv6.yaml` sets
`dhcp6: false` and `accept-ra: false` on `enp0s6`, so the VNIC GUA is not
configured and there is no default `::/0`. Tailscale ULA `fd7a:` stays.
CPA and VLESS therefore egress IPv4. Discover the current public IPv4 from the
VNIC or guest `curl -4` rather than a remembered literal.

sing-box is from the sagernet arm64 package; CPA uses the image's arm64
manifest. Numeric UID `cliproxyapi` is 994:988 here.

Do not copy `/var/lib/sing-box/tailscale-api` onto another guest.
Discover current Tailnet IPs at use time; do not treat a remembered `100.x` as
identity. CPA is reached on port `8317` through Tailnet where AxonHub is
configured as an upstream.

## Discovery

Resolve instance OCID from `compute instance list` by display name, then VNICs
from `instance list-vnics`. Public IPs in SSH `HostName` are copies; reserved
public IPs can move.

Instance metadata from a guest:

```bash
curl -sS -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/
```

`canonicalRegionName` `ap-chuncheon-1` vs `ap-singapore-2` distinguishes the
tenancy faster than hostname.

## Staleness rule

This map records tenancy split, SSH aliases, shapes, disk intent, and current
ownership. Discover public IPs, private IPs, volume OCIDs, lifecycle, and guest
filesystem usage at operation time. When the observed owner or size intent
differs, stop mutating and update this reference in the same change.
