# Warracker on Proxmox VE

The easiest way to run Warracker on Proxmox is the community-maintained
helper script from [Proxmox VE Helper-Scripts](https://github.com/community-scripts/ProxmoxVE)
(`ct/warracker.sh`, by BvdBerg01). It creates an LXC container and installs
Warracker in it — no Docker required.

> The helper script is maintained by the community-scripts project, not by
> Warracker. As with any script you run on your hypervisor host, read it
> before running it:
> https://github.com/community-scripts/ProxmoxVE/blob/main/ct/warracker.sh

## Install

Paste this into the **Shell** of your Proxmox node:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/warracker.sh)"
```

Select **Default Settings** for a standard install, or **Advanced Settings**
to change the resources. When it finishes, the script prints the URL to
open — it is the container's IP on port 80, for example:

```
http://192.168.1.100
```

Then create your first account in the web UI — the first account
automatically becomes the admin.

## Default resources

These are the script's defaults (change them under Advanced Settings):

| Setting      | Default       |
|--------------|---------------|
| CPU          | 1 vCPU        |
| RAM          | 512 MB        |
| Disk         | 4 GB          |
| OS           | Debian 13     |
| Privilege    | Unprivileged  |
| Architecture | x86_64 and ARM64 |

## How it differs from the Docker install

The helper script does **not** use Docker. It installs Warracker directly
in the container from the GitHub release tarball, under `/opt/warracker`,
with systemd services (`warracker`, `warrackermigration`, `nginx`) and a
Python virtual environment. Configuration and data live inside the
container, so back up the container itself (Proxmox backup) the way you
would any other LXC.

## Updating

Re-run the same helper script command. It detects the existing install
and updates it to the latest Warracker release (stopping the services,
deploying the new release, rebuilding the environment, and restarting).

## Notes

- If you prefer Docker, create a Debian LXC (or use the community Docker
  helper script) and follow the standard [Docker setup](../Docker/)
  inside it instead.
- Warracker is also available on [Unraid](../unraid/) (Community Apps)
  and [TrueNAS](../truenas/) (Apps catalog).
