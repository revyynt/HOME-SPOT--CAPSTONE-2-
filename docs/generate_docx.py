import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

doc = docx.Document()

# Page Margins
sections = doc.sections
for section in sections:
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

# Colors
PRIMARY = RGBColor(15, 23, 42)      # Slate 900
BRAND = RGBColor(5, 150, 105)        # Emerald 600
ACCENT = RGBColor(30, 58, 138)      # Blue 900
GRAY = RGBColor(100, 116, 139)       # Slate 500
BODY = RGBColor(30, 41, 59)         # Slate 800

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>'))

def set_cell_margins(cell, top=120, bottom=120, left=180, right=180):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def add_callout(text, title=None, bg="F0FDF4", border_color="059669"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, bg)
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    
    # Left border only
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'  <w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>'
        f'  <w:top w:val="none"/>'
        f'  <w:right w:val="none"/>'
        f'  <w:bottom w:val="none"/>'
        f'</w:tcBorders>'
    )
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    if title:
        run_title = p.add_run(title + "\n")
        run_title.bold = True
        run_title.font.name = "Calibri"
        run_title.font.size = Pt(10.5)
        run_title.font.color.rgb = BRAND if border_color == "059669" else ACCENT
    run = p.add_run(text)
    run.font.name = "Calibri"
    run.font.size = Pt(10)
    run.font.color.rgb = BODY
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

# Document Header / Title
title_p = doc.add_paragraph()
title_p.paragraph_format.space_before = Pt(0)
title_p.paragraph_format.space_after = Pt(2)
sub_run = title_p.add_run("MJP RESIDENCES • HOME-SPOT SYSTEM MANUAL\n")
sub_run.font.name = "Calibri"
sub_run.font.size = Pt(9.5)
sub_run.bold = True
sub_run.font.color.rgb = BRAND

main_title = title_p.add_run("Simple Guide to the NFC Keycard & Gate System")
main_title.font.name = "Calibri"
main_title.font.size = Pt(22)
main_title.bold = True
main_title.font.color.rgb = PRIMARY

desc_p = doc.add_paragraph()
desc_p.paragraph_format.space_after = Pt(14)
desc_run = desc_p.add_run(
    "A friendly, step-by-step handbook on how tenant keycards work, how to scan them with a phone "
    "or the automatic gate box, and how to check your building access records anytime."
)
desc_run.font.name = "Calibri"
desc_run.font.size = Pt(11)
desc_run.font.color.rgb = GRAY

# SECTION 1
h1 = doc.add_heading(level=1)
h1_run = h1.add_run("1. What Does This System Do for You?")
h1_run.font.color.rgb = ACCENT
h1_run.bold = True

p = doc.add_paragraph(
    "Managing a dormitory can be busy, especially when keeping track of who is coming and going. "
    "In the past, tenants signed their names in paper logbooks that were easy to skip, lose, or forget. "
    "With the Home-Spot Keycard System, paper logbooks are no longer needed."
)
p.paragraph_format.line_spacing = 1.2
p.paragraph_format.space_after = Pt(6)

bullets = [
    ("Replaces paper logbooks: ", "Every time a tenant taps their small card, the system instantly logs who they are, their room number, and the exact time."),
    ("Knows who is inside: ", "At a glance on your phone or computer, you can see exactly how many tenants are currently inside the building and who is out."),
    ("Automatic 10:00 PM curfew check: ", "If someone taps in past 10:00 PM, the system notes 'Curfew Violation' so you know who arrived late."),
    ("Alerts you if someone is away: ", "If a tenant taps out and hasn't returned for more than 7 days, it highlights them so you can check if they moved out unexpectedly."),
]
for bold_prefix, text in bullets:
    bp = doc.add_paragraph(style='List Bullet')
    bp.paragraph_format.space_after = Pt(3)
    bp.paragraph_format.line_spacing = 1.15
    r1 = bp.add_run(bold_prefix)
    r1.bold = True
    r1.font.color.rgb = PRIMARY
    r2 = bp.add_run(text)
    r2.font.color.rgb = BODY

# SECTION 2
h2 = doc.add_heading(level=1)
h2_run = h2.add_run("2. The Big Picture: How the Keycard Works")
h2_run.font.color.rgb = ACCENT
h2_run.bold = True

p2 = doc.add_paragraph(
    "Every registered tenant gets one durable plastic card (the size of an ATM or Beep card). "
    "Inside each card is a tiny wireless chip that needs no batteries."
)
p2.paragraph_format.line_spacing = 1.2
p2.paragraph_format.space_after = Pt(6)

rules = [
    ("First Tap Is Always Entry (IN): ", "When a brand-new tenant arrives with their card, their very first tap always marks them as entering the building (IN)."),
    ("Automatic Back-and-Forth: ", "The system is smart. If the tenant is currently recorded as INSIDE, tapping the card automatically marks them as going OUT. When they return and tap again, it marks them as coming IN. You never have to switch buttons manually."),
    ("Safe Against Unapproved Tenants: ", "If someone has an unassigned card or has not been approved by you yet, the card will NOT open the gate. Only fully assigned, active tenants can tap in.")
]
for bold_prefix, text in rules:
    bp = doc.add_paragraph(style='List Bullet')
    bp.paragraph_format.space_after = Pt(3)
    bp.paragraph_format.line_spacing = 1.15
    r1 = bp.add_run(bold_prefix)
    r1.bold = True
    r1.font.color.rgb = PRIMARY
    r2 = bp.add_run(text)
    r2.font.color.rgb = BODY

add_callout(
    "Good to know: If a tenant forgets whether they tapped in or out, you can look at the Gate Access "
    "screen on your dashboard anytime. It will clearly display either a green 'IN' badge or a gray 'OUT' badge.",
    title="Owner Tip: No Guesswork"
)

# SECTION 3
h3 = doc.add_heading(level=1)
h3_run = h3.add_run("3. Method 1: Using a Smartphone as the Scanner")
h3_run.font.color.rgb = ACCENT
h3_run.bold = True

p3 = doc.add_paragraph(
    "This method is perfect when a guard or staff member is at the front gate or lobby with a smartphone. "
    "Almost every modern phone (Android or iPhone) has an NFC reader built right in."
)
p3.paragraph_format.line_spacing = 1.2
p3.paragraph_format.space_after = Pt(6)

steps_phone = [
    ("Step 1 - Make sure NFC is turned ON: ", "On your Android or iPhone, go to Settings and make sure 'NFC' is switched on (just like turning on Wi-Fi or Bluetooth)."),
    ("Step 2 - Hold the card flat against the phone: ", "Ask the tenant to touch their card to the back of the phone. On iPhones, the scanner is near the top camera. On Androids, it is usually right in the middle of the back."),
    ("Step 3 - Hold still for just 1 second: ", "Keep the card flat against the phone until you hear the sound."),
    ("Step 4 - Listen to the sound: ", "The phone will play a friendly sound so you know right away if it worked:")
]
for bold_prefix, text in steps_phone:
    bp = doc.add_paragraph(style='List Bullet')
    bp.paragraph_format.space_after = Pt(3)
    bp.paragraph_format.line_spacing = 1.15
    r1 = bp.add_run(bold_prefix)
    r1.bold = True
    r1.font.color.rgb = PRIMARY
    r2 = bp.add_run(text)
    r2.font.color.rgb = BODY

# Phone Sounds Table
table = doc.add_table(rows=1, cols=3)
table.alignment = WD_TABLE_ALIGNMENT.CENTER
table.autofit = False
hdr = table.rows[0].cells
hdr[0].width = Inches(1.8)
hdr[1].width = Inches(2.2)
hdr[2].width = Inches(2.5)
hdr[0].text = "Sound from Phone"
hdr[1].text = "What It Means"
hdr[2].text = "What You Should Do"
for cell in hdr:
    set_cell_background(cell, "E2E8F0")
    set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
    for p in cell.paragraphs:
        for r in p.runs:
            r.bold = True
            r.font.size = Pt(9.5)
            r.font.color.rgb = PRIMARY

sound_rows = [
    ("Two Happy Beeps\n(Rising tone)", "ENTRY (IN)\nTenant has entered the building.", "Wave them in. The dashboard now shows them as INSIDE."),
    ("Gentle Low Chime\n(Falling tone)", "EXIT (OUT)\nTenant has left the building.", "Tenant is on their way out. Dashboard marks them OUT."),
    ("Low Error Buzz\n(Warning tone)", "CARD NOT RECOGNIZED\nCard is unassigned or inactive.", "Ask the tenant for their name. Check if their room is assigned on your admin screen."),
]

for s_sound, s_mean, s_action in sound_rows:
    row = table.add_row().cells
    row[0].width = Inches(1.8)
    row[1].width = Inches(2.2)
    row[2].width = Inches(2.5)
    row[0].text = s_sound
    row[1].text = s_mean
    row[2].text = s_action
    for cell in row:
        set_cell_margins(cell, top=80, bottom=80, left=140, right=140)
        for p in cell.paragraphs:
            p.paragraph_format.line_spacing = 1.15
            for r in p.runs:
                r.font.size = Pt(9)
                r.font.color.rgb = BODY

doc.add_paragraph().paragraph_format.space_after = Pt(8)

# SECTION 4
h4 = doc.add_heading(level=1)
h4_run = h4.add_run("4. Method 2: Using the Dedicated Gate Box (Automated)")
h4_run.font.color.rgb = ACCENT
h4_run.bold = True

p4 = doc.add_paragraph(
    "This method is for the automatic scanner box mounted right next to your gate or door. "
    "It connects directly to the electric lock so tenants can enter on their own without needing a guard."
)
p4.paragraph_format.line_spacing = 1.2
p4.paragraph_format.space_after = Pt(6)

steps_box = [
    ("How the tenant opens the gate: ", "The tenant touches their card to the black scanner pad on the wall."),
    ("Green light + 2 Beeps: ", "The light turns green, the buzzer beeps twice, and the electric gate lock clicks open for 5 seconds. The tenant pushes the gate open and walks in."),
    ("Gate locks automatically: ", "After 5 seconds, the lock clicks back into place. You never have to worry about anyone forgetting to lock the gate."),
    ("Red light + Long Buzz: ", "If someone taps an unregistered card or someone who is not a tenant, the light turns red and the gate stays firmly locked."),
]
for bold_prefix, text in steps_box:
    bp = doc.add_paragraph(style='List Bullet')
    bp.paragraph_format.space_after = Pt(3)
    bp.paragraph_format.line_spacing = 1.15
    r1 = bp.add_run(bold_prefix)
    r1.bold = True
    r1.font.color.rgb = PRIMARY
    r2 = bp.add_run(text)
    r2.font.color.rgb = BODY

add_callout(
    "Safety Feature: In case of a building power outage, the gate electric lock has a manual emergency "
    "key so you can always open it by hand from the inside or outside.",
    title="Important Safety Note",
    bg="FEF3C7",
    border_color="D97706"
)

# SECTION 5
h5 = doc.add_heading(level=1)
h5_run = h5.add_run("5. How to Check the Gate Screen on Your Dashboard")
h5_run.font.color.rgb = ACCENT
h5_run.bold = True

p5 = doc.add_paragraph(
    "Whenever you want to check your building, simply open your Home-Spot website, "
    "log in to the Admin Dashboard, and click the 'Gate Access' tab at the top. Here is what you will see:"
)
p5.paragraph_format.line_spacing = 1.2
p5.paragraph_format.space_after = Pt(6)

kpis = [
    ("Active Tenants (Blue): ", "The total number of registered tenants who have working keycards."),
    ("Inside (Green): ", "How many tenants are physically on the premises right now."),
    ("Outside (Amber): ", "How many tenants have tapped out and are currently away."),
    ("Away 7+ Days (Red): ", "Shows if anyone has been outside for more than a week without returning. This warns you in case a tenant quietly moved out."),
    ("Activity Log (Table below): ", "A running list showing tenant name, room number, whether they tapped IN or OUT, the exact date and time, and if it was On Time or a Curfew Violation.")
]
for bold_prefix, text in kpis:
    bp = doc.add_paragraph(style='List Bullet')
    bp.paragraph_format.space_after = Pt(3)
    bp.paragraph_format.line_spacing = 1.15
    r1 = bp.add_run(bold_prefix)
    r1.bold = True
    r1.font.color.rgb = PRIMARY
    r2 = bp.add_run(text)
    r2.font.color.rgb = BODY

# SECTION 6
h6 = doc.add_heading(level=1)
h6_run = h6.add_run("6. Frequently Asked Questions (Everyday Answers)")
h6_run.font.color.rgb = ACCENT
h6_run.bold = True

faqs = [
    (
        "Q: A new tenant just registered on Google, but their card says 'PENDING ISSUANCE'. Why?",
        "A: When someone registers online, they are put on hold until you (the owner/admin) approve them and choose their room number in the Tenants tab. Once you assign their room, their keycard becomes active immediately."
    ),
    (
        "Q: What if a tenant loses their plastic card?",
        "A: No problem at all! You do not need to change any door locks. Simply give the tenant a new replacement card, go to their profile on your Admin Dashboard, and type in the new card number. The old lost card is instantly cancelled and will never open the gate again."
    ),
    (
        "Q: What happens if the internet slows down?",
        "A: The system uses very tiny messages (less than 1 kilobyte) to talk to the cloud. Even on slow mobile data or standard Wi-Fi, it processes taps in less than half a second."
    ),
    (
        "Q: Can two people share one card?",
        "A: We recommend giving each tenant their own card. Because the system tracks who is inside and who is outside, sharing a card will confuse the records."
    ),
    (
        "Q: How do I see who broke curfew last night?",
        "A: Just look at the Gate Access Activity Log. Anyone who came in after 10:00 PM will have a red label saying 'Curfew Violation' next to their name."
    )
]

for q, a in faqs:
    qp = doc.add_paragraph()
    qp.paragraph_format.space_before = Pt(4)
    qp.paragraph_format.space_after = Pt(2)
    qr = qp.add_run(q)
    qr.bold = True
    qr.font.color.rgb = PRIMARY
    
    ap = doc.add_paragraph()
    ap.paragraph_format.space_after = Pt(6)
    ap.paragraph_format.line_spacing = 1.15
    ar = ap.add_run(a)
    ar.font.color.rgb = BODY

# SECTION 7 - PRINTABLE CHEAT SHEET
doc.add_page_break()
h7 = doc.add_heading(level=1)
h7_run = h7.add_run("7. Quick Cheat Sheet (Keep at the Desk)")
h7_run.font.color.rgb = BRAND
h7_run.bold = True

p7 = doc.add_paragraph(
    "You can print this page and tape it near your front desk or security station for quick reference:"
)
p7.paragraph_format.line_spacing = 1.15
p7.paragraph_format.space_after = Pt(8)

cs_table = doc.add_table(rows=1, cols=2)
cs_table.alignment = WD_TABLE_ALIGNMENT.CENTER
cs_table.autofit = False
hdr_cs = cs_table.rows[0].cells
hdr_cs[0].width = Inches(2.2)
hdr_cs[1].width = Inches(4.3)
hdr_cs[0].text = "Signal / Situation"
hdr_cs[1].text = "Action / Meaning"
for c in hdr_cs:
    set_cell_background(c, "059669")
    set_cell_margins(c, top=100, bottom=100, left=140, right=140)
    for p in c.paragraphs:
        for r in p.runs:
            r.bold = True
            r.font.size = Pt(10)
            r.font.color.rgb = RGBColor(255, 255, 255)

cheat_items = [
    ("Two Beeps + Green Light", "TENANT ENTERED (IN). Everything is normal. Door is unlocked for 5 seconds."),
    ("One Chime + Amber/Gray", "TENANT LEFT (OUT). Tap recorded successfully as leaving the building."),
    ("Long Buzz + Red Light", "CARD REJECTED. Card is either not registered or tenant has not been assigned a room yet."),
    ("Card Doesn't React", "Make sure the card touches the phone or reader box directly for a full second. Check if phone NFC is on."),
    ("Past 10:00 PM Tap", "AUTOMATIC CURFEW NOTE. The gate still opens safely, but it is recorded as a curfew violation on your screen."),
    ("Tenant Moving Out", "When a tenant leaves for good, click 'Archive' on their profile so their card can no longer unlock the gate.")
]

for col1, col2 in cheat_items:
    row = cs_table.add_row().cells
    row[0].width = Inches(2.2)
    row[1].width = Inches(4.3)
    row[0].text = col1
    row[1].text = col2
    for cell in row:
        set_cell_margins(cell, top=80, bottom=80, left=140, right=140)
        for p in cell.paragraphs:
            p.paragraph_format.line_spacing = 1.15
            for r in p.runs:
                r.font.size = Pt(9.5)
                r.font.color.rgb = BODY

footer_p = doc.add_paragraph()
footer_p.paragraph_format.space_before = Pt(20)
footer_p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = footer_p.add_run("Home-Spot Smart Dormitory Management System • MJP Residences\nNeed help? Contact your Capstone Developer Team anytime.")
fr.font.size = Pt(8.5)
fr.font.color.rgb = GRAY

doc.save(r"C:\Capstone\HOME-SPOT-main\docs\HomeSpot-NFC-User-Guide-Client.docx")
doc.save(r"C:\Capstone\HomeSpot-NFC-User-Guide-Client.docx")
print("Saved docx successfully!")
