# Home-Spot - HTML/CSS/JavaScript Version
<<<<<<< HEAD

This is the converted HTML version of the Home-Spot Booking & Management System for client delivery.
=======
>>>>>>> d16b89af355bed0e0bdd799cae10c68365b947bf

## 📁 File Structure

```
/public/
├── index.html                      # Tenant homepage
├── property-detail.html            # Room detail page with dynamic loading
├── admin-login.html                # Login portal for admins
├── admin-dashboard.html            # Admin dashboard with full features
├── super-admin-dashboard.html      # Super admin platform management
├── README.md                       # Complete documentation
├── QUICKSTART.md                   # Quick start guide for clients
└── assets/
    ├── css/
    │   └── style.css               # Custom styles and utilities
    └── js/
        ├── main.js                 # Core JavaScript functionality
        └── property-detail.js      # Room detail page logic
```

## 🚀 How to Use

### Option 1: Direct File Opening
1. Navigate to the `/public/` folder
2. Double-click `index.html` to open in your browser
3. All pages work without a server

### Option 2: Local Server (Recommended)
Using Python:
```bash
cd public
python -m http.server 8000
```
Then visit: http://localhost:8000

Using Node.js (http-server):
```bash
npm install -g http-server
cd public
http-server
```

Using PHP:
```bash
cd public
php -S localhost:8000
```

## 🌐 Technology Stack

- **HTML5** - Semantic markup
- **Tailwind CSS** - Via CDN for styling (no build process needed)
- **Vanilla JavaScript** - For interactivity
- **No dependencies** - Runs on any web server or directly in browser

## 📄 Completed Pages

✅ **index.html** - Tenant Home Page
- Hero section with Home-Spot branding
- Amenities showcase
- Room listings (Single, Double, Triple, Quad)
- About section
- Responsive footer

✅ **property-detail.html** - Room Detail Page
- Dynamic room loading based on URL parameter (id=1,2,3,4)
- Photo galleries for each room
- Availability badges and alerts
- Inquire Now form with validation
- Reserve Apartment form with identity verification fields
- Manager/Owner information
- All room details, features, and amenities

✅ **admin-login.html** - Admin/Super Admin Login
- Role selection (Admin/Super Admin)
- Demo credentials included
- Form validation

✅ **admin-dashboard.html** - Admin Dashboard
- Overview with stats and recent activity
- My Listings management
- Reservation requests with Approve/Decline
- Messages from tenants
- Reviews and ratings
- Tab-based navigation

✅ **super-admin-dashboard.html** - Super Admin Dashboard
- Platform-wide statistics
- User management (Admin CRUD)
- System settings (Maintenance mode, Platform rules)
- Message templates management
- Escalations handling
- System backup and restore

✅ **Custom CSS & JavaScript**
- Toast notification system
- Tab management
- Form handlers
- Smooth scrolling
- Room data with URL parameters

## 🔄 Working Features

### Dynamic Functionality
- ✅ Room detail pages load dynamically based on URL (?id=1, ?id=2, etc.)
- ✅ Form submissions with toast notifications
- ✅ Tab switching in dashboards
- ✅ Inquiry and reservation forms
- ✅ Approve/Decline reservation actions
- ✅ Reply to messages
- ✅ All images from Unsplash integrated
- ✅ Responsive design on all pages

## 📝 Features

### Tenant Features
- Browse available rooms
- View room details with photo galleries
- Inquire about rooms
- Submit reservation requests
- View amenities and facilities

### Admin Features (Dashboard)
- View all listings
- Manage reservations
- Approve/decline booking requests
- Message tenants
- View reviews and ratings

### Super Admin Features
- Platform-wide management
- User role administration
- System maintenance
- Message templates
- Escalation handling

## 🎨 Styling

The site uses **Tailwind CSS** via CDN (v3). No build process required.

Custom styles are in `/assets/css/style.css` for:
- Toast notifications
- Form inputs
- Modals
- Tabs
- Loading states

## 💾 Data Storage

Currently uses mock/demo data. To connect to a real backend:

1. Replace the mock data in `main.js` with API calls
2. Update form submissions to POST to your API
3. Add authentication tokens/session management
4. Implement proper error handling

Example API integration:
```javascript
// Instead of:
Toast.success('Inquiry sent!');

// Use:
fetch('/api/inquiries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(formData)
})
.then(response => response.json())
.then(data => Toast.success('Inquiry sent!'))
.catch(error => Toast.error('Failed to send inquiry'));
```

## 📱 Responsive Design

All pages are fully responsive and work on:
- Desktop (1920px+)
- Laptop (1280px - 1920px)
- Tablet (768px - 1280px)
- Mobile (320px - 768px)

## 🔒 Security Notes

For production deployment:
1. Implement server-side authentication
2. Use HTTPS
3. Validate all inputs server-side
4. Add CSRF protection
5. Implement rate limiting
6. Sanitize user inputs

## 📞 Client Deployment Options

### Simple Hosting (Static Sites)
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

### Traditional Hosting
- Upload to any web hosting via FTP
- Works with Apache, Nginx, IIS
- No server-side requirements

### With Backend
If you need a database/backend:
1. Keep the frontend as-is
2. Add a REST API (Node.js, PHP, Python, etc.)
3. Update JavaScript to call your API endpoints

## 📄 License

Capstone Project - Apartment Booking & Management System
© 2026 Home-Spot. All rights reserved.

---

**Status**: ✅ All pages completed and fully functional
**Last Updated**: March 9, 2026
**Total Pages**: 5 HTML files + CSS + JavaScript
