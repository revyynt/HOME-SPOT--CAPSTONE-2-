import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = docx.Document()

# Set standard 1-inch margins
for section in doc.sections:
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

# Colors
PRIMARY = RGBColor(15, 23, 42)
BODY = RGBColor(30, 41, 59)

# Title
title_p = doc.add_paragraph()
title_p.paragraph_format.space_before = Pt(0)
title_p.paragraph_format.space_after = Pt(18)
title_p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER

title_run = title_p.add_run("ACKNOWLEDGEMENTS")
title_run.font.name = "Times New Roman"
title_run.font.size = Pt(14)
title_run.bold = True
title_run.font.color.rgb = PRIMARY

paragraphs = [
    (
        "The completion of this capstone research and development project, entitled "
        "\"Home-Spot: A Smart Dormitory and Boarding House Management System with IoT NFC Access Control for MJP Residences,\" "
        "has been an enriching, challenging, and deeply transformative journey. This endeavor would not have been possible "
        "without the wisdom, guidance, encouragement, and invaluable assistance of numerous individuals and institutions "
        "who generously extended their time, knowledge, and support throughout every phase of our work."
    ),
    (
        "First and foremost, we offer our deepest gratitude and adoration to the Almighty God, the sovereign source of wisdom, "
        "knowledge, strength, and endurance. We thank Him for sustaining us through demanding development cycles, sleepless "
        "nights of coding and debugging, and moments of uncertainty. His grace gave us the resilience to overcome technical "
        "obstacles, keep our vision clear, and bring this project to fruition for His greater honor and glory."
    ),
    (
        "We express our heartfelt appreciation to our Capstone Adviser, along with the esteemed members of the Defense Panel "
        "and faculty of the College of Information Technology. Thank you for your constructive critiques, professional mentorship, "
        "and patient guidance. Your insightful questions and uncompromising standards pushed us beyond our perceived limits, "
        "transforming this capstone from a simple school requirement into an enterprise-grade, secure, and production-ready system."
    ),
    (
        "Our sincere gratitude goes to our partner beneficiary, the management and administration of MJP Residences. "
        "Thank you for warmly opening your doors to our team, sharing your operational insights, providing real-world business "
        "requirements, and placing your trust in our solution. Your willingness to collaborate on the floor plan modeling, "
        "billing workflows, and NFC gate access deployment provided the authentic foundation upon which this research stands."
    ),
    (
        "To our beloved parents, families, and guardians—words cannot fully capture our profound gratitude. Thank you for your "
        "unconditional love, unending patience, and steadfast prayers. We are forever grateful for the financial sacrifices, "
        "warm meals, words of reassurance during exhausted evenings, and quiet confidence you placed in our potential. "
        "Every milestone we achieve is a testament to the foundation you built for us, and we dedicate this accomplishment to you."
    ),
    (
        "To my esteemed groupmates and fellow researchers—thank you for the camaraderie, shared grit, and synergy that defined "
        "our team. Through every syntax error, database migration, long meeting, and celebration of small breakthroughs, "
        "we stood by one another with mutual accountability and unwavering dedication. This accomplishment reflects not just our "
        "individual contributions, but the power of our unity and collective commitment to excellence."
    ),
    (
        "Lastly, we thank our dear friends, colleagues, and fellow batchmates who shared in our college journey, offered words "
        "of encouragement, and reminded us to keep pressing forward. To everyone who contributed in ways both seen and unseen, "
        "we extend our sincerest and most heartfelt appreciation."
    )
]

for p_text in paragraphs:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(10)
    p.paragraph_format.line_spacing = 1.5  # Standard thesis line spacing
    p.paragraph_format.first_line_indent = Inches(0.5)
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    
    r = p.add_run(p_text)
    r.font.name = "Times New Roman"
    r.font.size = Pt(12)
    r.font.color.rgb = BODY

# Sign-off
sign_p = doc.add_paragraph()
sign_p.paragraph_format.space_before = Pt(20)
sign_p.paragraph_format.space_after = Pt(0)
sign_p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT

r_team = sign_p.add_run("Renz Alex Zander E. Gaviño\nand the Home-Spot Research Team\n")
r_team.bold = True
r_team.font.name = "Times New Roman"
r_team.font.size = Pt(12)
r_team.font.color.rgb = PRIMARY

r_date = sign_p.add_run("Researchers")
r_date.font.italic = True
r_date.font.name = "Times New Roman"
r_date.font.size = Pt(11)
r_date.font.color.rgb = PRIMARY

# Save both in docs and root
docx_path_docs = r"C:\Capstone\HOME-SPOT-main\docs\HomeSpot-Thesis-Acknowledgement.docx"
docx_path_root = r"C:\Capstone\HomeSpot-Thesis-Acknowledgement.docx"
doc.save(docx_path_docs)
doc.save(docx_path_root)

# Plain text file
txt_content = """ACKNOWLEDGEMENTS

The completion of this capstone research and development project, entitled "Home-Spot: A Smart Dormitory and Boarding House Management System with IoT NFC Access Control for MJP Residences," has been an enriching, challenging, and deeply transformative journey. This endeavor would not have been possible without the wisdom, guidance, encouragement, and invaluable assistance of numerous individuals and institutions who generously extended their time, knowledge, and support throughout every phase of our work.

First and foremost, we offer our deepest gratitude and adoration to the Almighty God, the sovereign source of wisdom, knowledge, strength, and endurance. We thank Him for sustaining us through demanding development cycles, sleepless nights of coding and debugging, and moments of uncertainty. His grace gave us the resilience to overcome technical obstacles, keep our vision clear, and bring this project to fruition for His greater honor and glory.

We express our heartfelt appreciation to our Capstone Adviser, along with the esteemed members of the Defense Panel and faculty of the College of Information Technology. Thank you for your constructive critiques, professional mentorship, and patient guidance. Your insightful questions and uncompromising standards pushed us beyond our perceived limits, transforming this capstone from a simple school requirement into an enterprise-grade, secure, and production-ready system.

Our sincere gratitude goes to our partner beneficiary, the management and administration of MJP Residences. Thank you for warmly opening your doors to our team, sharing your operational insights, providing real-world business requirements, and placing your trust in our solution. Your willingness to collaborate on the floor plan modeling, billing workflows, and NFC gate access deployment provided the authentic foundation upon which this research stands.

To our beloved parents, families, and guardians—words cannot fully capture our profound gratitude. Thank you for your unconditional love, unending patience, and steadfast prayers. We are forever grateful for the financial sacrifices, warm meals, words of reassurance during exhausted evenings, and quiet confidence you placed in our potential. Every milestone we achieve is a testament to the foundation you built for us, and we dedicate this accomplishment to you.

To my esteemed groupmates and fellow researchers—thank you for the camaraderie, shared grit, and synergy that defined our team. Through every syntax error, database migration, long meeting, and celebration of small breakthroughs, we stood by one another with mutual accountability and unwavering dedication. This accomplishment reflects not just our individual contributions, but the power of our unity and collective commitment to excellence.

Lastly, we thank our dear friends, colleagues, and fellow batchmates who shared in our college journey, offered words of encouragement, and reminded us to keep pressing forward. To everyone who contributed in ways both seen and unseen, we extend our sincerest and most heartfelt appreciation.


                                                    Renz Alex Zander E. Gaviño
                                                    and the Home-Spot Research Team
                                                    Researchers
"""

txt_path_docs = r"C:\Capstone\HOME-SPOT-main\docs\HomeSpot-Thesis-Acknowledgement.txt"
txt_path_root = r"C:\Capstone\HomeSpot-Thesis-Acknowledgement.txt"
with open(txt_path_docs, "w", encoding="utf-8") as f:
    f.write(txt_content)
with open(txt_path_root, "w", encoding="utf-8") as f:
    f.write(txt_content)

print("Saved Acknowledgements in docx and txt successfully!")
