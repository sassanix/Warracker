# Warracker on TrueNAS SCALE

Warracker is available in the official TrueNAS Apps catalog, so on
TrueNAS SCALE you install it from the web UI — no manual Docker setup
required.

## Install from the catalog

1. In the TrueNAS web UI, go to **Apps → Discover Apps**.
2. Search for **Warracker** and click **Install**.
3. Fill in the install form: give the app a name, set the port you want
   to reach it on, and choose storage locations for the app's data and
   its database. (If you are unsure, the catalog defaults are a fine
   starting point — you can change storage later by editing the app.)
4. Click **Install** and wait for the app to become Active.
5. Open Warracker at `http://<your-truenas-ip>:<port>` and create your
   first account — the first account automatically becomes the admin.

If Warracker does not appear in the catalog, refresh it first
(**Apps → Manage Catalogs → Refresh**) and search again.

## Updating

Updates arrive through the catalog like any other app: when TrueNAS
shows an update for Warracker, apply it from **Apps → Installed
Applications**. Your warranties and files live in the storage you
configured, so updating the app does not touch them.

## Install as a Custom App instead

If you want full control over the configuration (for example, custom
environment variables from the Warracker `.env` file), install it as a
**Custom App** instead and paste in the compose file from the
repository root (`docker-compose.yml`), adapted to your pool's storage
paths. The standard Docker environment variables apply — see
[Docker/.env.example](../Docker/.env.example) and the
[Configuration](https://github.com/sassanix/Warracker/wiki/Configuration)
wiki page.

## Notes

- Warracker is also available on [Unraid](../unraid/) (Community Apps)
  and [Proxmox](../proxmox/) (community helper script).
- Backups: the catalog install keeps data in the storage locations you
  chose. Back those up the same way you back up any other app's data —
  see the [Backup and Restore](https://github.com/sassanix/Warracker/wiki/Backup-and-Restore)
  wiki page for what matters (database + uploads folder).
