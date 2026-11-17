---
name: oci
description: >
  Operate Oracle Cloud Infrastructure from the owner's CLI: tenancies, regions,
  compute instances, boot/block volumes, VNICs, public IPv4/IPv6, Always Free
  quota, SSH aliases for oracle-kr and oracle-sg, and guest-stack deploys. Use
  for OCI inventory, resize, IPv6, start/stop, networking, or fleet work.
---

# OCI Operations

## Scope and references

This skill is CLI operations for the owner's two OCI tenancies, not a console
tutorial and not a service installer. Establish the execution host (normally the
owner's Mac), the target tenancy/profile, and the SSH alias before mutating
anything. `~` and `~/.oci` refer to the execution host.

Read [Fleet map](references/fleet.md) before touching a named host. Treat it as
an ownership map, then revalidate instance state, VNIC addresses, volume size,
and SSH reachability at use time.

For IPv6, Docker FORWARD, or a parallel guest stack, use the matching section
below, then record durable tenancy/VCN facts in the fleet map.

Compute and block-storage facts that change every session (lifecycle, public IP,
used disk, image digest, ephemeral GUA) stay in the task report. Durable tenancy
split, profile names, SSH aliases, Always Free rules, and IPv6 prefixes live in
the fleet map.

## Safety

- `~/.oci/config`, `*.pem`, fingerprints, user/tenancy OCIDs, and console
  sessions are credentials. Inspect the smallest field projection. Do not print,
  upload, or commit PEM material or full API keys.
- Select the profile that matches the target tenancy. `DEFAULT` is Singapore;
  `KR` is Chuncheon. A successful list in the wrong region is not proof the
  target instance exists.
- Keep diagnostic probes read-only until the failing layer is identified. Do
  not stop, terminate, or detach a volume to test a guess.
- Always Free block storage is **per tenancy**, not per instance. Count every
  AVAILABLE boot and block volume before a resize. TERMINATED volumes still
  listed by `boot-volume list` do not consume quota once gone from
  `resource-availability`.
- Unattached boot volumes from retired instances still consume the free 200 GB
  until deleted. Confirm they are unattached before delete.
- Preserve the surviving SSH path. Resize of an attached boot volume is online;
  grow the GPT partition and filesystem afterwards, or the guest still sees the
  old size.
- An Oracle-assigned VCN IPv6 `/56` cannot be removed. Confirm the VCN has no
  `ipv6-cidr-blocks` before calling `add-ipv6-vcn-cidr`.
- Do not copy `/var/lib/sing-box/tailscale-api` onto a second guest. That reuses
  the Tailnet node identity and knocks the source offline.

## Auth and profiles

CLI lives on the owner's Mac (`oci` via Homebrew). Config owner is
`~/.oci/config`.

| Profile | Region | Tenancy role | Key file |
| --- | --- | --- | --- |
| `DEFAULT` | `ap-singapore-2` | Singapore Always Free / A1 | `~/.oci/sg.pem` |
| `KR` | `ap-chuncheon-1` | Korea Always Free / A1 | `~/.oci/kr.pem` |

Every Korea command needs `--profile KR`. Compartment for both current fleets is
the tenancy root; discover the OCID from the matching profile's `tenancy=` line
rather than copying it into ad-hoc scripts.

Auth is API-key, not `oci session`. `oci session validate` failing on `DEFAULT`
is expected. Append `OCI_API_KEY` as a last line of each PEM when tightening
key hygiene; `SUPPRESS_LABEL_WARNING=True` only hides the reminder.

Browser fallback when a profile is missing:

```bash
oci session authenticate --region ap-chuncheon-1 --profile-name KR
```

That token is short-lived. Prefer a durable API key in the matching profile.

## Workflow

1. **Identify tenancy and host.** Map the request to Singapore or Korea, then to
   an SSH alias (`oracle-sg`, `oracle-kr`). Read the fleet map.
2. **Capture a bounded baseline.** List the instance, boot-volume attachment,
   VNIC public/private IP, and guest `lsblk`/`df`. For quota work, also read
   `total-free-storage-gb` availability in that AD.
3. **Edit the owner.** Change OCI resources through CLI on the Mac. Change
   guest partition/filesystem over SSH on the instance. Do not mix tenancies or
   grow a filesystem before the volume reports the new size as `AVAILABLE`.
4. **Validate before activation.** For a resize, confirm remaining free GB
   covers `new - old`, and that unattached volumes that would block the quota
   are intentionally deleted. For networking, confirm the VNIC still has the
   expected public IP before rewriting SSH `HostName`.
5. **Activate narrowly.** One volume, one instance, or one VNIC at a time.
   Guest `growpart`/`resize2fs` only after the hypervisor disk has rescanned.
6. **Verify.** Instance `RUNNING`, volume size matches, guest `lsblk` matches
   the volume, `df` shows the grown filesystem, and `ssh <alias>` still returns
   a banner or command. Report remaining Always Free storage.

## Inventory

```bash
TENANCY=$(awk '/^\[KR\]/{p=1;next} /^\[/{p=0} p && /^tenancy=/{sub(/^tenancy=/,""); print; exit}' ~/.oci/config)
AD='CFdC:AP-CHUNCHEON-1-AD-1'   # discover from instance.availability-domain

oci --profile KR iam region-subscription list
oci --profile KR compute instance list --compartment-id "$TENANCY" --all --output table
oci --profile KR bv boot-volume list --compartment-id "$TENANCY" --availability-domain "$AD" --all --output table
oci --profile KR compute instance list-vnics --instance-id "$INSTANCE_OCID"
oci --profile KR limits resource-availability get \
  --service-name block-storage --limit-name total-free-storage-gb \
  --compartment-id "$TENANCY" --availability-domain "$AD"
```

Boot-volume list in these home regions is AD-scoped. A region-wide call without
`--availability-domain` is an incomplete inventory.

Guest identity when SSH works and CLI profile is uncertain:

```bash
ssh "$HOST" 'curl -sS -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/'
```

That payload names `displayName`, `canonicalRegionName`, `id`, and
`compartmentId`. Compare `compartmentId` to the profile `tenancy=` line.

## Always Free storage and boot resize

Always Free block storage is 200 GB per tenancy (`total-free-storage-gb` /
`total-free-storage-gb-regional`). Default images often ship a ~47 GB boot
volume. Expanding toward 200 GB is the intended free-tier layout, matching
`oracle-sg`.

Korea is a single A1 box using the full 200 GB. Size a new boot only after
counting every other AVAILABLE volume in that AD.

Online boot grow:

1. Confirm attachment and guest SSH.
2. Free quota if unattached retired boot volumes are holding the 200 GB cap.
3. `oci … bv boot-volume update --boot-volume-id ID --size-in-gbs N --wait-for-state AVAILABLE`.
   Size can only increase.
4. On the guest, rescan (`echo 1 | sudo tee /sys/class/block/sda/device/rescan`),
   then `sudo growpart /dev/sda 1` and `sudo resize2fs /dev/sda1` for the current
   Ubuntu GPT layout (root is the last partition). Confirm with `lsblk` and `df`.

Keep VPUs at the existing value (currently 10, auto-tune off on the Singapore
boot). Changing performance is a separate, possibly billed, decision.

## SSH aliases

Live index is `~/.ssh/config`. OCI VNIC public IP is the source of truth for
`HostName`; update the alias when the reserved IP moves.

| SSH Host | Tenancy | IdentityFile |
| --- | --- | --- |
| `oracle-sg` | Singapore | `~/.ssh/oracle-sg.key` |
| `oracle-kr` | Korea | `~/.ssh/oracle-kr.key` |

`User` is `ubuntu` on both. Accept a new host key only after the VNIC public IP
matches the intended instance.


## IPv6

Oracle guests only have link-local IPv6 until the **VCN** has an Oracle GUA
`/56`. A public IPv4 on the VNIC does not imply IPv6. Singapore already has a
`/56`; Korea was enabled the same way. Prefixes live in the fleet map.

1. **VCN.** `oci network vcn get`. If `ipv6-cidr-blocks` is empty:
   `oci network vcn add-ipv6-vcn-cidr --vcn-id ID --is-oracle-gua-allocation-enabled true --wait-for-state SUCCEEDED`.
   Oracle assigns one `/56`. It cannot be removed or resized.
2. **Subnet.** Take the first `/64` of that `/56` (the `/56` itself with prefix
   length 64). `oci network subnet add-ipv6-subnet-cidr --subnet-id ID --ipv6-cidr-block PREFIX/64 --wait-for-state SUCCEEDED`.
3. **Route.** On the subnet's route table, add `::/0` to the **same** internet
   gateway as `0.0.0.0/0`. IPv4 default does not cover IPv6.
4. **Security list.** IPv4 `0.0.0.0/0` rules do not match `::/0`. Add egress
   `all` to `::/0`; ingress protocol `58` (ICMPv6) from `::/0`; TCP 22 and 443
   from `::/0` if those services should be reachable. Discover other needed
   ports from the guest listeners.
5. **VNIC.** `oci network ipv6 create --vnic-id ID --wait-for-state AVAILABLE`.
   Record the GUA from the response; do not invent one.
6. **Guest.** Keep `50-cloud-init.yaml` as dhcp4-only (cloud-init rewrites it).
   Put `dhcp6: true` on the primary NIC in `/etc/netplan/99-ipv6.yaml` (`chmod
   600`), then `netplan apply`. Expect a `/128` GUA plus an RA default via the
   subnet `ipv6-virtual-router-ip` (`fe80::…`).
7. **Verify.** Guest `curl -6 --max-time 8 https://ifconfig.co/ip` must print
   that GUA. Inbound: `ssh -6 -i <IdentityFile> ubuntu@GUA`. Oracle images often
   leave ip6tables INPUT ACCEPT; IPv4 INPUT still rejects non-22.

A second instance on the same subnet only needs step 5–7.

## Parallel guest stack

Use this when copying an existing Oracle guest's services onto a new box
**without** cutover. Production ownership stays on the source until
DNS/Tailnet/AxonHub are switched.

1. **Inventory the source** over SSH: enabled units, timers, `ss -lntup`, Docker
   compose projects, certbot live names, iptables INPUT/FORWARD, `uname -m`.
2. **Rebuild, do not copy binaries** when arch differs (`x86_64` vs `aarch64`).
   sing-box: sagernet apt repo + `DEBIAN_FRONTEND=noninteractive apt-get -o Dpkg::Options::=--force-confold install sing-box`
   (otherwise the conffile prompt fails). CPA image `eceasy/cli-proxy-api:latest` has an arm64 manifest; pin `user:` to the **destination** `uid:gid` from `getent`, never a remembered source UID.
3. **New Tailnet node.** Change the sing-box endpoint `hostname` before the first start. Leave `state_directory` empty/new. `ExecStartPost` that waits for `tailscale0` IPv4 will kill the unit until login; a helper that `exit 0` when no address is present keeps VLESS/mixed up. Do not enable certbot or derper against a hostname still pointing at production.
4. **Guest firewall.** Oracle Ubuntu images REJECT IPv4 INPUT except 22 (and often FORWARD). Open 443 (and later 8443/3478/41641) in `/etc/iptables/rules.v4` **before** the INPUT REJECT. Comment out FORWARD REJECT or Docker cannot create bridge networks (`Failed to Setup IP tables`). Reload with `iptables-restore`, not a second `netfilter-persistent` pass that duplicates chains.
5. **Bind later.** CPA compose may list `100.x:port` binds; drop those until the new node has a Tailnet IPv4, keep `127.0.0.1`. After login, add the new address and run the tailscale route helper.
6. **Verify without cutover.** Source units still `active`; destination loopback CPA returns `401` on `/v1/models`; sing-box listens on 443/7892; no public DNS change.

## Proof table

| Observation | What it proves |
| --- | --- |
| `oci iam region-subscription list` for a profile | That profile can authenticate to its home region |
| Instance `RUNNING` in the matching region | Compute lifecycle, not guest disk or SSH |
| Boot volume `AVAILABLE` at the new GB | Hypervisor size; guest may still show the old disk |
| Guest `lsblk` disk size matches volume | Rescan succeeded |
| Guest `df` on `/` matches the grown partition | `growpart` + `resize2fs` succeeded |
| `ssh alias` returns a command result | Alias, key, security list, and public IP path |
| Guest `curl -6` to ifconfig.co prints the VNIC GUA | Outbound IPv6 path (VCN, subnet, route, RA, dhcp6) |
| `ssh -6 -i key ubuntu@GUA` succeeds | Inbound IPv6 (security list, guest sshd, GUA assignment) |
| Destination CPA `/v1/models` is `401` and source stays `active` | Parallel stack is up without cutover |
| Docker compose fails with iptables FORWARD | Guest FORWARD REJECT still in front of Docker chains |

## Keeping this skill useful

Store durable procedures and tenancy-split rules here. Keep host/volume OCIDs,
shapes, and IPv6 prefixes in the fleet map. Discover public IPs, volume sizes,
GUA assignments, and lifecycle at use time. Leave incident timelines and
one-off CLI dumps out of the skill.
