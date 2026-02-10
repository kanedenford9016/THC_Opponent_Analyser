"""PDF report generator for member vetting analysis."""

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
from reportlab.platypus.flowables import HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
import textwrap

from thc_edge.logging_setup import setup_logging
from thc_edge.config import Config

logger = setup_logging(__name__)


class MemberVettingPDF:
    """Generate professional PDF reports for member vetting."""
    
    def __init__(self, output_dir: Optional[Path] = None):
        """Initialize PDF generator."""
        self.output_dir = output_dir or Config.OUTPUT_DIR
        self.output_dir.mkdir(exist_ok=True, parents=True)
        
        # Color scheme
        self.primary_color = colors.HexColor('#1a237e')  # Dark blue
        self.secondary_color = colors.HexColor('#0d47a1')  # Medium blue
        self.accent_color = colors.HexColor('#2196f3')  # Light blue
        self.success_color = colors.HexColor('#4caf50')  # Green
        self.warning_color = colors.HexColor('#ff9800')  # Orange
        self.danger_color = colors.HexColor('#f44336')  # Red
        self.text_color = colors.HexColor('#212121')  # Dark gray
        self.light_gray = colors.HexColor('#f5f5f5')
        
    def generate_report(self, members_data: List[Dict], filename: Optional[str] = None) -> Path:
        """
        Generate PDF report for multiple members.
        
        Args:
            members_data: List of member analysis dictionaries
            filename: Optional custom filename
        
        Returns:
            Path to generated PDF file
        """
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"member_vetting_report_{timestamp}.pdf"
        
        output_path = self.output_dir / filename
        
        # Create PDF document
        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=letter,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch
        )
        
        # Build document content
        story = []
        
        # Cover page
        story.extend(self._create_cover_page(len(members_data)))
        story.append(PageBreak())
        
        # Member pages
        for i, member_data in enumerate(members_data):
            story.extend(self._create_member_page(member_data))
            if i < len(members_data) - 1:
                story.append(PageBreak())
        
        # Build PDF
        doc.build(story)
        
        logger.info(f"Generated PDF report: {output_path}")
        return output_path
    
    def _create_cover_page(self, member_count: int) -> List:
        """Create cover page."""
        styles = getSampleStyleSheet()
        elements = []
        
        # Add some space
        elements.append(Spacer(1, 2*inch))
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=36,
            textColor=self.primary_color,
            spaceAfter=30,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        elements.append(Paragraph("MEMBER VETTING REPORT", title_style))
        
        # Subtitle
        subtitle_style = ParagraphStyle(
            'Subtitle',
            parent=styles['Normal'],
            fontSize=18,
            textColor=self.secondary_color,
            spaceAfter=40,
            alignment=TA_CENTER
        )
        elements.append(Paragraph(f"Analysis of {member_count} Candidate(s)", subtitle_style))
        
        # Horizontal line
        elements.append(HRFlowable(width="80%", thickness=2, color=self.accent_color, spaceAfter=40))
        
        # Report info
        info_style = ParagraphStyle(
            'Info',
            parent=styles['Normal'],
            fontSize=12,
            textColor=self.text_color,
            alignment=TA_CENTER,
            spaceAfter=10
        )
        
        elements.append(Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", info_style))
        elements.append(Paragraph("<b>THC Edge Faction Analysis System</b>", info_style))
        
        return elements
    
    def _create_member_page(self, member_data: Dict) -> List:
        """Create detailed page for a single member."""
        styles = getSampleStyleSheet()
        elements = []
        
        ps = member_data.get("personalstats", {})
        
        # Header section
        elements.extend(self._create_header(member_data))
        elements.append(Spacer(1, 0.1*inch))
        
        # Basic info section
        elements.extend(self._create_basic_info_section(member_data))
        elements.append(Spacer(1, 0.08*inch))
        
        # Combat performance section
        elements.extend(self._create_combat_section(ps))
        elements.append(Spacer(1, 0.08*inch))
        
        # Training & activity section
        elements.extend(self._create_training_activity_section(ps))
        elements.append(Spacer(1, 0.08*inch))
        
        # Assessment section
        elements.extend(self._create_assessment_section(member_data))
        
        return elements
    
    def _create_header(self, member_data: Dict) -> List:
        """Create member header."""
        styles = getSampleStyleSheet()
        elements = []
        
        name = member_data.get("name", "Unknown")
        player_id = member_data.get("player_id", "N/A")
        level = member_data.get("level", "N/A")
        
        # Name and ID
        header_style = ParagraphStyle(
            'MemberHeader',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=self.primary_color,
            spaceAfter=3,
            fontName='Helvetica-Bold'
        )
        elements.append(Paragraph(f"{name} [ID: {player_id}]", header_style))
        
        # Level and status
        subheader_style = ParagraphStyle(
            'Subheader',
            parent=styles['Normal'],
            fontSize=9,
            textColor=self.secondary_color,
            spaceAfter=5
        )
        status = member_data.get("status", "N/A")
        elements.append(Paragraph(f"Level {level} | Status: {status}", subheader_style))
        
        # Horizontal line
        elements.append(HRFlowable(width="100%", thickness=1, color=self.primary_color, spaceAfter=5))
        
        return elements
    
    def _create_basic_info_section(self, member_data: Dict) -> List:
        """Create basic info section."""
        elements = []
        
        ps = member_data.get("personalstats", {})
        activity = ps.get("activity", {})
        
        time_played = activity.get("time", 0)
        days_played = time_played // 1440
        hours_played = (time_played % 1440) // 60
        
        current_streak = activity.get("streak", {}).get("current", 0)
        best_streak = activity.get("streak", {}).get("best", 0)
        
        # Create info table
        data = [
            ["Time Played", f"{days_played} days, {hours_played} hours"],
            ["Current Streak", f"{current_streak} days"],
            ["Best Streak", f"{best_streak} days"],
        ]
        
        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), self.light_gray),
            ('TEXTCOLOR', (0, 0), (-1, -1), self.text_color),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        
        elements.append(table)
        
        return elements
    
    def _create_combat_section(self, ps: Dict) -> List:
        """Create combat performance section."""
        styles = getSampleStyleSheet()
        elements = []
        
        # Section header
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=11,
            textColor=self.primary_color,
            spaceAfter=4,
            fontName='Helvetica-Bold'
        )
        elements.append(Paragraph("COMBAT PERFORMANCE", section_style))
        
        attacks = ps.get("attacks", {})
        defends = ps.get("defends", {})
        
        # Combat stats table
        data = [
            ["Metric", "Value", "Assessment"],
            [
                "Attacks",
                f"{attacks.get('total', 0)} total",
                f"{attacks.get('winrate', 'N/A')} win rate"
            ],
            [
                "Defends",
                f"{defends.get('total', 0)} total",
                f"{defends.get('winrate', 'N/A')} win rate"
            ],
            [
                "Hit Accuracy",
                ps.get("hits", {}).get("accuracy", "N/A"),
                self._get_accuracy_assessment(ps.get("hits", {}).get("accuracy", "0%"))
            ],
            [
                "ELO Rating",
                str(ps.get("elo", "N/A")),
                self._get_elo_assessment(ps.get("elo", 1000))
            ],
            [
                "Best Kill Streak",
                str(ps.get("killstreak", 0)),
                self._get_streak_assessment(ps.get("killstreak", 0))
            ],
            [
                "One-Hit Kills",
                str(ps.get("one_hit_kills", 0)),
                "Power indicator"
            ],
        ]
        
        table = Table(data, colWidths=[1.8*inch, 1.4*inch, 2.2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), self.primary_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
            ('TOPPADDING', (0, 1), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 2),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, self.light_gray]),
        ]))
        
        elements.append(table)
        
        return elements
    
    def _create_training_activity_section(self, ps: Dict) -> List:
        """Create training and drug usage section."""
        styles = getSampleStyleSheet()
        elements = []
        
        # Section header
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=11,
            textColor=self.primary_color,
            spaceAfter=4,
            fontName='Helvetica-Bold'
        )
        elements.append(Paragraph("TRAINING COMMITMENT", section_style))
        
        drugs = ps.get("drugs", {})
        rehab = drugs.get("rehabilitations", {})
        
        # Training table
        data = [
            ["Total Drugs Used", f"{drugs.get('total', 0):,}"],
            ["Xanax (Defense)", f"{drugs.get('xanax', 0):,}"],
            ["Ecstasy (Combat)", f"{drugs.get('ecstasy', 0):,}"],
            ["Rehabilitations", f"{rehab.get('amount', 0):,} (${rehab.get('fees', 0):,})"],
            ["Overdoses", f"{drugs.get('overdoses', 0)}"],
        ]
        
        table = Table(data, colWidths=[2.5*inch, 2.9*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), self.light_gray),
            ('TEXTCOLOR', (0, 0), (-1, -1), self.text_color),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        
        elements.append(table)
        
        return elements
    
    def _create_assessment_section(self, member_data: Dict) -> List:
        """Create assessment section."""
        from thc_edge.member_analysis import generate_analysis_summary
        
        styles = getSampleStyleSheet()
        elements = []
        
        # Section header
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=11,
            textColor=self.primary_color,
            spaceAfter=4,
            fontName='Helvetica-Bold'
        )
        elements.append(Paragraph("DETAILED ASSESSMENT", section_style))
        
        # Assessment box with colored background
        assessment_text = generate_analysis_summary(member_data)
        
        assessment_style = ParagraphStyle(
            'Assessment',
            parent=styles['BodyText'],
            fontSize=7,
            leading=9,
            textColor=self.text_color,
            leftIndent=10,
            rightIndent=10,
            spaceAfter=3,
            spaceBefore=3
        )
        
        # Split into paragraphs
        sections = assessment_text.split('\n\n')
        for section in sections:
            if section.strip():
                # Bold the section headers
                if ':' in section and section.index(':') < 30:
                    header, rest = section.split(':', 1)
                    formatted = f"<b>{header}:</b>{rest}"
                else:
                    formatted = section
                elements.append(Paragraph(formatted, assessment_style))
                elements.append(Spacer(1, 0.02*inch))
        
        return elements
    
    def _get_accuracy_assessment(self, accuracy_str: str) -> str:
        """Get assessment for hit accuracy."""
        try:
            accuracy = float(accuracy_str.rstrip('%'))
            if accuracy >= 50:
                return "Excellent"
            elif accuracy >= 40:
                return "Good"
            elif accuracy >= 30:
                return "Average"
            else:
                return "Developing"
        except:
            return "N/A"
    
    def _get_elo_assessment(self, elo: int) -> str:
        """Get assessment for ELO rating."""
        if elo >= 2000:
            return "Elite"
        elif elo >= 1500:
            return "Strong"
        elif elo >= 1200:
            return "Average"
        else:
            return "Developing"
    
    def _get_streak_assessment(self, streak: int) -> str:
        """Get assessment for kill streak."""
        if streak >= 50:
            return "Exceptional"
        elif streak >= 20:
            return "Very Good"
        elif streak >= 10:
            return "Good"
        else:
            return "Standard"
