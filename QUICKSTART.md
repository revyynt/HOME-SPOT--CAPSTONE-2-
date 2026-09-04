# DORMKAYA - Quick Start Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Open the Website
1. Navigate to the `/public/` folder
2. Double-click `index.html`
3. Your browser will open the DORMKAYA homepage

### Step 2: Navigate the Site

**For Tenants (Main Website):**
- Browse available rooms on the homepage
- Click any room card to view details
- Use "Inquire Now" for questions
- Use "Reserve Dorm" to submit a booking request

**For Admins (Dashboard):**
- Click "Owner Portal" in the header
- Login with: `admin@dormkaya.com` / `admin123`
- Manage listings, reservations, and messages

**For Super Admin (Platform Management):**
- Click "Owner Portal" in the header
- Select "Super Admin" role
- Login with: `super@dormkaya.com` / `super123`
- Manage users, system settings, and escalations

### Step 3: Test Features

**Try These Actions:**
1. View room details (click any room)
2. Submit an inquiry form
3. Submit a reservation request
4. Login to admin dashboard
5. Approve/decline a reservation
6. Reply to a message

## 📂 File Structure

```
public/
├── index.html                    ← Main homepage
├── property-detail.html          ← Room details (opens when clicking a room)
├── admin-login.html             ← Login page
├── admin-dashboard.html         ← Admin dashboard
├── super-admin-dashboard.html   ← Super admin dashboard
└── assets/
    ├── css/style.css            ← Custom styling
    ├── js/main.js               ← Main JavaScript
    └── js/property-detail.js    ← Room detail logic
```

## 🔗 How Pages Connect

```
Index (Homepage)
├── Click Room Card → property-detail.html?id=1
├── Click "Owner Portal" → admin-login.html
│   ├── Login as Admin → admin-dashboard.html
│   └── Login as Super Admin → super-admin-dashboard.html
└── All pages link back to homepage
```

## 💡 Key Features

### Tenant Website
- 4 room types with real images
- Interactive forms
- Smooth scrolling
- Mobile responsive

### Admin Dashboard
- 5 tabs: Overview, Listings, Reservations, Messages, Reviews
- Approve/Decline buttons
- Quick actions
- Real-time stats (mock data)

### Super Admin Dashboard
- User management table
- System settings
- Message templates
- Escalation handling
- Platform statistics

## 🎨 Customization

### Change Colors
Edit `assets/css/style.css` or modify Tailwind classes in HTML files.

### Change Text/Content
Edit the HTML files directly - all content is in plain HTML.

### Change Images
Replace Unsplash URLs with your own image URLs in:
- `index.html` (room cards)
- `assets/js/property-detail.js` (room data)

### Add More Rooms
Edit `assets/js/property-detail.js` and add to the `roomsData` array.

## 🌐 Deployment

### Option 1: Simple Hosting (No Backend)
1. Upload entire `/public/` folder to your hosting
2. Set `index.html` as the default page
3. Done! (Works with any hosting: GoDaddy, Bluehost, etc.)

### Option 2: GitHub Pages (Free)
1. Create a GitHub account
2. Create a new repository
3. Upload files from `/public/` folder
4. Enable GitHub Pages in settings
5. Your site is live at: `yourusername.github.io/repo-name`

### Option 3: Netlify (Free, Recommended)
1. Sign up at netlify.com
2. Drag and drop the `/public/` folder
3. Your site is live instantly with HTTPS

### Option 4: With Backend/Database
1. Keep these HTML files as frontend
2. Set up a backend (Node.js, PHP, Python, etc.)
3. Create API endpoints
4. Update JavaScript to call your APIs
5. Add database (MySQL, PostgreSQL, MongoDB)

## 🔧 Common Tasks

### Update Room Prices
Edit `assets/js/property-detail.js` → find `roomsData` → change `price` field

### Change Contact Info
Edit `index.html` → find footer section → update phone/email

### Disable a Room
Edit `assets/js/property-detail.js` → set `available: 0` for that room

### Add New Admin User
Edit `super-admin-dashboard.html` → User Management tab → Add row to table

## ❓ Troubleshooting

**Problem: Images not loading**
- Solution: Check internet connection (images load from Unsplash)

**Problem: Forms not working**
- Solution: Make sure JavaScript is enabled in browser

**Problem: Room detail page shows wrong room**
- Solution: Check the URL parameter (?id=1, ?id=2, etc.)

**Problem: Tabs not switching**
- Solution: Make sure `main.js` is loading properly

## 📞 Support

For technical issues with HTML/CSS/JavaScript:
1. Check browser console (F12) for errors
2. Verify all files are in correct folders
3. Test in different browsers (Chrome, Firefox, Edge)

## 🎓 Learning Resources

**To Customize Further:**
- HTML: w3schools.com/html
- CSS/Tailwind: tailwindcss.com/docs
- JavaScript: javascript.info

## ✅ Checklist for Client Delivery

- [ ] Test all pages in browser
- [ ] Verify all forms work
- [ ] Check all images load
- [ ] Test on mobile device
- [ ] Review all text content
- [ ] Confirm contact information is correct
- [ ] Test login functionality
- [ ] Verify all buttons work
- [ ] Check responsive design
- [ ] Test in multiple browsers

---

**Ready to Deploy?** Just upload the `/public/` folder to your hosting and you're done!

**Questions?** All code is well-commented for easy understanding.

**Last Updated:** March 9, 2026
