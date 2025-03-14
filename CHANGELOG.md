# Changelog

## [0.9.7.5] - 2025-03-14
- **Fixes**
  - Removed remember me
  - Fixed admin settings, admins can now remove users
  - Admins can now disable registrations


## [0.9.7] - 2025-03-13

- **Authentication Enhancements**
  - Added "Remember Me" functionality to the login page, allowing users to stay logged in across sessions.
  - Implemented auto-login feature that checks for a valid session cookie and automatically logs in users if they have opted for "Remember Me".
  - Updated the login endpoint to accept a `remember_me` parameter and set a persistent session cookie when checked.
  - Created a new `/api/auth/auto-login` endpoint to handle auto-login requests.

- **User Management Improvements**
  - Enhanced user registration process to validate email format and password strength.
  - Added functionality to check if registration is enabled or disabled via the `/api/auth/registration-status` endpoint.
  - Implemented user profile update functionality, allowing users to change their first and last names.
  - Added admin-only endpoints for managing user accounts, including viewing, updating, and deleting users.
  - **User Deletion Functionality**
    - Enhanced modal functionality for user deletion, including improved error checking and logging.
    - Improved `deleteUser` function with better error handling and user ID retrieval.
    - Added support for handling both numeric IDs and usernames in the deletion process.
    - Created diagnostic functions to test modal functionality and user deletion processes.
    - Improved event handling for user-related actions, ensuring proper setup of event listeners.

- **Admin Management**
  - View Users: Admins can view a list of all registered users, including their details such as usernames, email addresses, and account statuses.
  - Delete User Accounts: Admins have the ability to delete user accounts, removing them from the system entirely.
  - Monitor System Health: Admins can check the health of the application and server, ensuring that everything is running smoothly.

- **Settings Page Updates**
  - Created a settings page for users to manage their preferences, including email notifications and default view settings.
  - Implemented backend support for retrieving and updating user preferences via the `/api/auth/preferences` endpoint.
  - Added validation for user preferences to ensure only valid values are accepted.

- **Database Enhancements**
  - Updated database schema to include user sessions and password reset tokens for improved security and functionality.
  - Added indexes to improve query performance for user and warranty data.
  - Implemented error handling and logging for database operations to facilitate easier debugging and maintenance.

- **UI/UX Improvements**
  - Enhanced the login form with a "Remember Me" checkbox and improved styling for better user experience.
  - Added loading indicators and toast notifications for better feedback during authentication processes.
  - Improved the overall layout and design of the settings and authentication pages for a more cohesive look.
  - Added a "Show Users List" button to the admin controls for easy access to user management.

- **Security Enhancements**
  - Implemented secure cookie handling for session tokens to prevent XSS attacks.
  - Added validation checks for user input to prevent SQL injection and other common vulnerabilities.
  - Ensured that sensitive operations are protected by authentication and authorization checks.

- **What's not working**
  - The menu still needs work done, the gear icon is not consistent 
  - When putting in the wrong password, you will need to refresh the page and try again manually.
  - Email notification still doesn't work
  - Users can't delete their own account, but admins can


## [0.5.2] - 2025-03-09

### Changed
- Enhanced user interface consistency and dark mode support
  - Fixed alignment issues between search field and status dropdown
  - Improved empty state display in both light and dark modes
  - Standardized padding and sizing for search and filter controls
  - Better vertical alignment of form controls in table header

### Fixed
- Proper centering of "No warranties" message in the dashboard table
  - Implemented responsive overlay for empty state messages
  - Fixed background colors in dark mode for empty state displays
  - Ensured consistent text color across all themes
  - Improved mobile responsiveness for empty state messages

## [0.5.1] - 2025-03-08

### Changed
- Improved warranty status display
  - Status information now consistently displayed at the bottom of warranty cards
  - Better visual hierarchy with status as the last item before document links
  - Enhanced color-coding for different status types (active, expiring, expired)
  - Consistent status positioning across all view types (grid, list, table)

### Fixed
- Table view layout and display issues
  - Fixed product names being truncated in table view
  - Improved column width distribution for better content display
  - Prevented document links from overflowing their container
  - Enhanced mobile responsiveness for table view
  - Better alignment of table headers with content
  - Improved styling of links in table view for better readability
  - Fixed vertical stacking of document links on smaller screens


## [0.5.0] - 2025-03-07

### Added
- Enhanced filtering and sorting capabilities
  - Status filter (All, Active, Expiring Soon, Expired)
  - Multiple sorting options (Expiration Date, Purchase Date, Name)
  - Export filtered warranties as CSV
  - Improved filter controls layout
  - Mobile-responsive filter design
- Multiple view options for warranty display
  - Grid view with card layout (default)
  - List view for compact horizontal display
  - Table view for structured data presentation
  - View preference saved between sessions
  - Responsive design for all view types
- Optional purchase price tracking
  - Users can now add purchase prices to warranties
  - Price information displayed in warranty cards
  - Currency formatting with dollar sign
  - Included in warranty summary and exports

### Changed
- Completely redesigned user interface
  - Modern card-based layout for warranties
  - Enhanced filter controls with improved styling
  - Better visual hierarchy with labeled filter groups
  - Custom dropdown styling with intuitive icons
  - Improved spacing and alignment throughout
  - Consistent color scheme and visual feedback
  - Responsive grid layout for warranty cards

### Fixed
- Status indicator borders now correctly displayed for all warranty states
  - Green border for active warranties
  - Orange border for warranties expiring soon
  - Red border for expired warranties
- Consistent status styling across all warranty cards
- Form now resets to first tab after successful warranty submission
- Manual filename now properly cleared when form is reset

## [0.4.0] - 2025-03-07

### Added
- Improved warranty creation process
  - Multi-step form with intuitive navigation
  - Progress indicator showing completion status
  - Enhanced validation with clear error messages
  - Summary review step before submission
  - Expiration date preview in summary
  - Responsive design for all device sizes

### Fixed
- Progress indicator alignment issue in multi-step form
  - Contained indicator within form boundaries
  - Prevented overflow with improved CSS approach
  - Ensured consistent tab widths for better alignment
- Improved tab navigation visual feedback

## [0.3.0] - 2025-03-07

### Added
- Product manual upload support
  - Users can now upload a second document for product manuals
  - Manual documents are displayed alongside invoices in the warranty details
  - Both add and edit forms support manual uploads
- Product URL support
  - Users can now add website URLs for products
  - Links to product websites displayed in warranty cards
  - Easy access to product support and information pages

### Changed
- Improved document link styling for consistency
  - Enhanced visual appearance of document links
  - Consistent styling between invoice and manual links
  - Better hover effects for document links
  - Fixed styling inconsistencies between document links
- Improved warranty card layout
  - Document links now displayed side by side for better space utilization
  - Responsive design adapts to different screen sizes
  - More compact and organized appearance

### Fixed
- Styling inconsistency between View Invoice and View Manual buttons
- Removed unused CSS file to prevent styling conflicts

## [0.2.5-beta] - 2025-03-07

### Added
- Product manual upload support
  - Users can now upload a second document for product manuals
  - Manual documents are displayed alongside invoices in the warranty details
  - Both add and edit forms support manual uploads

### Changed
- Improved document link styling for consistency
  - Enhanced visual appearance of document links
  - Consistent styling between invoice and manual links
  - Better hover effects for document links
  - Fixed styling inconsistencies between document links

### Fixed
- Styling inconsistency between View Invoice and View Manual buttons
- Removed unused CSS file to prevent styling conflicts


## [0.2.0-beta] - 2025-03-06

### Added
- Export functionality for warranty data as CSV
- Refresh button for manual data updates
- Search and filtering options for warranty list
- Enhanced mobile responsiveness

### Changed
- Removed Debug Information panel from status page
- Improved error handling and data validation across all dashboard functions
- Enhanced chart creation with support for various data formats
- Streamlined user interface by removing development elements
- Improved data normalization for warranty information
- Added fallback mechanisms for missing or invalid data
- Updated status chart calculations for better accuracy

### Fixed
- API connection error handling
- Chart instance memory leaks
- Invalid data structure handling from API responses
- Negative value calculations in status charts

[0.2.0-beta]: [https://github.com/username/warracker/releases/tag/v0.05.2-beta](https://github.com/sassanix/Warracker/releases/tag/0.2.0)

## [0.1.0] - New Features and enhancements 

### Added
- Basic warranty tracking functionality
- Dashboard with warranty statistics
- Timeline visualization
- Status overview chart
- Recent expirations list

## [0.05.2-beta] - 2025-03-05

### Added
- Multiple serial numbers support for warranties
  - Users can now add multiple serial numbers per warranty item
  - Dynamic form fields for adding/removing serial numbers
  - Database schema updated to support multiple serial numbers

### Changed
- Enhanced warranty management interface
  - Improved form handling for serial numbers
  - Better organization of warranty details
- Optimized database queries with new indexes
  - Added index for serial numbers lookup
  - Added index for warranty ID relationships

### Technical
- Database schema improvements
  - New `serial_numbers` table with proper foreign key constraints
  - Added indexes for better query performance
  - Implemented cascading deletes for warranty-serial number relationships

### Fixed
- Form validation and handling for multiple serial numbers
- Database connection management and resource cleanup

[0.05.2-beta]: https://github.com/username/warracker/releases/tag/v0.05.2-beta
