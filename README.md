
<div align="center">
    
<img src="https://github.com/user-attachments/assets/2132a842-4233-4d37-8fde-b2d23353ed76" width="100"/>

<h1 <strong>Warracker</strong></h1>
<p align="center">
    <b>Open-source warranty tracker for individuals and teams.</b> <br/>
The easiest way to organize product warranties, monitor expiration dates, and store receipts or related documents.
</b>
</p>
</div>


<div align="center">
    
![GitHub issues](https://img.shields.io/github/issues/sassanix/Warracker)
![GitHub license](https://img.shields.io/github/license/sassanix/Warracker)
![GitHub last commit](https://img.shields.io/github/last-commit/sassanix/Warracker)
![GitHub release](https://img.shields.io/github/v/release/sassanix/Warracker)
![GitHub contributors](https://img.shields.io/github/contributors/sassanix/Warracker)
[![Discord](https://img.shields.io/badge/discord-chat-green?logo=discord)](https://discord.gg/PGxVS3U2Nw)

<p align="center">
  <img src="images/demo2.gif" alt="Warracker Demo" width="650">
</p>


#


</div>
⭐ If you find Warracker helpful, we’d truly appreciate a star on GitHub! Your support motivates us to keep improving and building great new features.

#

## 🌟Overview

**Warracker** is a web-based application that simplifies the management of product warranties. It allows users to organize warranty information, monitor expiration dates, and securely store related documents.


## 🔑 Key Features

| **Feature**                      | **Description**                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 🗃️ **Centralized Management**   | Track all your product warranties in one place                                                           |
| 🧾 **Detailed Records**          | Store purchase dates, durations, notes, and product photos with thumbnail previews                       |
| 📄 **Document Storage**          | Upload receipts, invoices, and manuals securely                                                          |
| 📝 **Warranty Claims**               | Manage warranty claims end-to-end with statuses, dates, resolutions, and full lifecycle visibility       |
| 🔔 **Proactive Alerts**          | Get alerts for upcoming expirations via email or 100+ push services (Discord, Slack, etc.) using Apprise |
| 🔍 **Quick Search and Filter**   | Search by product name, serial number, vendor, tags, and more with real-time filtering                   |
| #️⃣ **Multiple Serial Numbers**  | Add and manage multiple serial numbers per product                                                       |
| 🌍 **Global Warranty View**      | Authenticated users can view global warranty data with role-based permissions                            |
| 👥 **Multi-User Support**        | Manage multiple accounts with admin controls and global access toggles                                   |
| 📤 **Data Export/Import**        | Import/export warranty data via CSV                                                                      |
| ⚙️ **Customizable Settings**     | Configure currency, date formats, notification timing, and branding                                      |
| 🌐 **Internationalization Support** | Support for multiple currencies and date formats tailored to regional preferences, enabling a seamless global user experience |
| 🏷️ **Tagging**                  | Organize warranties using custom tags                                                                    |
| 🔐 **Password Reset**            | Token-based, secure account recovery system                                                              |
| 🔑 **OIDC SSO**                  | Single sign-on with providers like Google, GitHub, and Keycloak                                          |
| 📊 **Status Dashboard**          | Visual analytics and stats with charts, tables, and global/user views                                    |
| 📱 **Responsive UI**             | Mobile-friendly interface with admin tools and improved UX                                               |
| 📦 **Paperless-ngx Integration** | Store/manage documents directly in Paperless-ngx with file-level control                                 |
| 📖 **Localization Support**       | [Full multilingual UI with 17 languages](https://github.com/sassanix/Warracker?tab=readme-ov-file#-localization-support), RTL support, instant language switching, and native name display |

---

## Project Status

**Warracker is in active beta.**
The essential features are reliable and ready for everyday use. Development is ongoing, with regular updates and improvements.

* ✅ Stable core for tracking, notification , and managing warranty documents, files
* ✅ Full support for self-hosted deployments
* ⚒️ Advanced enhancements are still being worked on
* ✍️ Your feedback and bug reports help shape the future of the app

## 📸Screenshots

**Home Page**

<img width="1204" height="1019" alt="image" src="https://github.com/user-attachments/assets/bcb92f64-23fe-4a94-95c1-b55975abe94d" />

<img width="1201" height="1012" alt="image" src="https://github.com/user-attachments/assets/52100483-fab8-4f4f-954b-64ff3a1bf496" />

**Status Dashboard**  

![image](https://github.com/user-attachments/assets/0f84cbcb-e434-42b9-9874-070f6a39292e)

## 🛠️Technology Stack

*   **Frontend**: HTML, CSS, JavaScript
*   **Backend**: Python with Flask
*   **Database**: PostgreSQL
*   **Containerization**: Docker and Docker Compose
*   **Web Server**: Nginx

## 🗺️Roadmap

* ✅ User Authentication
* ✅ Settings Page
* ✅ Status Page
* ✅ Customizable Reminders
* ✅ Email Notifications
* ✅ Warranty Categories via Tags
* ✅ CSV Import/Export
* ✅ OIDC SSO Functionality
* ✅ Advanced User/Admin Controls
* ✅ Paperless-ngx integration
* ✅ Localization Support
* ✅ Warranty Claim Tracking
* [ ] Audit trail
* [ ] Calendar Integration
      
## 🚀Setup

### Prerequisites

*   Docker and Docker Compose installed on your system.

## 🐋Pull Docker

```
services:
  warracker:
    image: ghcr.io/sassanix/warracker/main:latest
    ports:
      - "8005:80"
    volumes:
      - warracker_uploads:/data/uploads
    env_file:
      - .env
    depends_on:
      warrackerdb:
        condition: service_healthy
    restart: unless-stopped

  warrackerdb:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  warracker_uploads:
```

To get the docker compose file with environemts and .env example for warracker and the warrackerdb please go [here](https://github.com/sassanix/Warracker/tree/main/Docker)

## 📝Usage

### Adding a Warranty

1.  Fill in the product details by clicking on add warranty.
2.  Enter the purchase date and warranty duration.
3.  Optionally upload receipt/documentation.
4.  Click the "Add Warranty" button.

### Managing Warranties

*   Use the search box to filter warranties.
*   Click the edit icon to modify warranty details.
*   Click the delete icon to remove a warranty.

## Product Information Entry Requirements for CSV import

| Field Name     | Format / Example                          | Required?                                              | Notes                                                                 |
|----------------|-------------------------------------------|--------------------------------------------------------|-----------------------------------------------------------------------|
| **ProductName** | Text                                       | ✅ Yes                                                  | Provide the name of the product.                                     |
| **PurchaseDate** | Date (`YYYY-MM-DD`, e.g., `2024-05-21`)   | ✅ Yes                                                  | Use ISO format only.                                                 |
| **WarrantyDurationYears** | Whole Number (`0`, `1`, `5`)      | ✅ Yes, if `IsLifetime` is `FALSE` and Months/Days are 0/blank. At least one duration field (Years, Months, Days) must be non-zero if not lifetime. | Represents the years part of the warranty. Can be combined with Months and Days. |
| **WarrantyDurationMonths** | Whole Number (`0`, `6`, `18`)    | ✅ Yes, if `IsLifetime` is `FALSE` and Years/Days are 0/blank. At least one duration field (Years, Months, Days) must be non-zero if not lifetime. | Represents the months part of the warranty. Can be combined with Years and Days. Max 11 if Years also provided. |
| **WarrantyDurationDays** | Whole Number (`0`, `15`, `90`)     | ✅ Yes, if `IsLifetime` is `FALSE` and Years/Months are 0/blank. At least one duration field (Years, Months, Days) must be non-zero if not lifetime. | Represents the days part of the warranty. Can be combined with Years and Months. Max 29/30 if Months also provided. |
| **IsLifetime**  | `TRUE` or `FALSE` (case-insensitive)       | ❌ No (Optional)                                        | If omitted, defaults to `FALSE`. If `TRUE`, duration fields are ignored. |
| **PurchasePrice** | Number (`199.99`, `50`)                  | ❌ No (Optional)                                        | Cannot be negative if provided.                                      |
| **SerialNumber** | Text (`SN123`, `SN123,SN456`)             | ❌ No (Optional)                                        | For multiple values, separate with commas.                           |
| **ProductURL**   | Text (URL format)                         | ❌ No (Optional)                                        | Full URL to product page (optional field). https://producturl.com                           |
| **Vendor**       | Text                                      | ❌ No (Optional)                                        | Name of the vendor or seller where the product was purchased.        |
| **Tags**         | Text (`tag1,tag2`)                        | ❌ No (Optional)                                        | Use comma-separated values for multiple tags.                        |

---
## 🌐 Localization Support

Warracker offers **full multilingual UI support** with **17 languages**, including **RTL (Right-to-Left) support**, instant language switching, and native name display.

### Supported Languages

| Language                 | Code     | Native Name           | Notes           |
|--------------------------|----------|----------------------|-----------------|
| Arabic 🇸🇦               | ar       | العربية               | *RTL Support*   |
| Czech 🇨🇿                | cs       | Čeština               |                 |
| German 🇩🇪               | de       | Deutsch               |                 |
| English 🇬🇧              | en       | English               | *Default*       |
| Spanish 🇪🇸              | es       | Español               |                 |
| Persian 🇮🇷              | fa       | فارسی                 | *RTL Support*   |
| French 🇫🇷               | fr       | Français              |                 |
| Hindi 🇮🇳                | hi       | हिन्दी                |                 |
| Italian 🇮🇹              | it       | Italiano              |                 |
| Japanese 🇯🇵             | ja       | 日本語                 |                 |
| Korean 🇰🇷               | ko       | 한국어                 |                 |
| Dutch 🇳🇱                | nl       | Nederlands            |                 |
| Portuguese 🇵🇹           | pt       | Português             |                 |
| Russian 🇷🇺              | ru       | Русский               |                 |
| Ukrainian 🇺🇦            | uk       | Українська            |                 |
| Chinese (Simplified) 🇨🇳 | zh_CN    | 简体中文               |                 |
| Chinese (Hong Kong) 🇭🇰  | zh_HK    | 繁體中文 (香港)        |                 |

### Language Selection Features

- **Auto-Detection:** Automatically detects browser language on first visit  
- **User Preference:** Saves individual language choice to user profile  
- **Native Names:** Dropdown displays language names in native scripts for clarity  
- **Instant Switching:** Change languages in real-time without page reload  
---

## Why I Built This

Warracker was born from personal frustration with warranty confusion. When my father’s dishwasher broke, we had the invoice and assumed it was under warranty, only to find out we were referencing the wrong one, and the warranty had ended by a couple of months.

That experience, along with others like it, made me realize how common and avoidable these issues are. So I built **Warracker**, a simple, organized way to track purchases, receipts, and warranties. It has already saved me money by reminding me to get car repairs done before my warranty expired.

Inspired by [**Wallos**](https://github.com/ellite/Wallos), I wanted to bring the same clarity to warranties that it brought to subscriptions and share it with anyone who's ever been burned by missed coverage.


## Contributing

We welcome contributions and appreciate your interest in improving this project! To get started, please follow these steps:


### How to Contribute

1. **Fork** the repository.
2. **Create a branch** for your changes:
   `git checkout -b feature/amazing-feature`
3. **Commit** your changes:
   `git commit -m "Add: amazing feature"`
4. **Push** to your forked repository:
   `git push origin feature/amazing-feature`
5. **Open a Pull Request** with a clear explanation of your changes.

### 📌Contribution Guidelines

* **Start with an issue**: Before submitting a Pull Request, ensure the change has been discussed in an issue.
* **Help is welcome**: Check the [issues](../../issues) for open discussions or areas where help is needed.
* **Keep it focused**: Each Pull Request should focus on a single change or feature.
* **Follow project style**: Match the project's code style and naming conventions.
* **Be respectful**: We value inclusive and constructive collaboration.

### 🤝Contributors:  
<a href="https://github.com/sassanix/warracker/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=sassanix/warracker" />
</a>

### ❤️Supporters:

[<img src="https://avatars.githubusercontent.com/u/8194208?u=7ee82feed0044f85bcfc39f001643fe81a188f66&v=4&s=50" width="50"/>](https://github.com/SirSpidey)
[<img src="https://avatars.githubusercontent.com/u/6196195?v=4&s=50" width="50"/>](https://github.com/keithellis74)
[<img src="https://avatars.githubusercontent.com/u/79404036?v=4&s=50" width="50"/>](https://github.com/CristianKerr)
[<img src="https://avatars.githubusercontent.com/u/145632931?v=4&s=50" width="50"/>](https://github.com/rssmithtx)
[<img src="https://avatars.githubusercontent.com/u/110860055?v=4&s=50" width="50"/>](https://github.com/Morethanevil)



[![Support Warracker](https://img.shields.io/badge/Support-Warracker-red?style=for-the-badge&logo=github-sponsors)](https://buymeacoffee.com/sassanix)


## Join Our Community

[![Join our Discord server!](https://invidget.switchblade.xyz/PGxVS3U2Nw)](https://discord.gg/PGxVS3U2Nw)

Want to discuss the project or need help? Join our Discord community!

## 📜License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🙏Acknowledgements

*   Flask
*   PostgreSQL
*   Docker
*   Chart.js
*   Apprise
*   i18next


## ⭐Star History
<a href="https://star-history.com/#sassanix/Warracker&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sassanix/Warracker&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sassanix/Warracker&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sassanix/Warracker&type=Date" />
 </picture>
</a>
