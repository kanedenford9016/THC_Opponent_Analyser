"""Member analysis - fetch and display personalstats for vetting."""

from typing import Dict, Optional
from thc_edge.api_client import APIClient
from thc_edge.logging_setup import setup_logging

logger = setup_logging(__name__)


class MemberAnalyzer:
    """Analyze individual member personal stats for vetting."""
    
    def __init__(self, api_client: Optional[APIClient] = None, api_key: Optional[str] = None):
        """Initialize member analyzer."""
        self.api_client = api_client or APIClient(api_key=api_key)
    
    async def analyze_member(self, player_id: str) -> Optional[Dict]:
        """
        Fetch and analyze a member's personal stats.
        
        Args:
            player_id: Player ID to analyze
        
        Returns:
            Dictionary with formatted personal stats or None if error
        """
        try:
            # Fetch full player data including personalstats
            player_data = await self.api_client.fetch_player_stats(player_id)
            
            if not player_data:
                logger.warning(f"No data returned for player {player_id}")
                return None
            
            # Extract personal stats
            personalstats = player_data.get("personalstats", {})
            
            if not personalstats:
                logger.warning(f"No personalstats found for player {player_id}")
                return None
            
            # Extract profile (basic info)
            profile = player_data.get("profile", {})
            
            # Format status
            status_obj = profile.get("status", {})
            if isinstance(status_obj, dict):
                status_state = status_obj.get("state", "N/A")
                status_desc = status_obj.get("description", "")
                status = f"{status_state}" + (f" - {status_desc}" if status_desc else "")
            else:
                status = str(status_obj)
            
            # Format the analysis
            analysis = {
                "player_id": player_id,
                "level": profile.get("level", "N/A"),
                "age": profile.get("age", "N/A"),
                "status": status,
                "name": profile.get("name", "N/A"),
                "personalstats": self._format_personalstats(personalstats),
                "raw_stats": player_data.get("battle_stats", {}),
            }
            
            logger.info(f"Successfully analyzed member {player_id}")
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing member {player_id}: {e}")
            return None
    
    def _format_personalstats(self, personalstats: Dict) -> Dict:
        """
        Format personal stats for display.
        
        Args:
            personalstats: Raw personalstats from API
        
        Returns:
            Formatted personal stats dictionary
        """
        formatted = {}
        
        # Combat stats
        attacking = personalstats.get("attacking", {})
        if attacking:
            attacks = attacking.get("attacks", {})
            attacks_total = attacks.get("won", 0) + attacks.get("lost", 0) + attacks.get("stalemate", 0)
            attacks_won = attacks.get("won", 0)
            attack_winrate = (attacks_won / attacks_total * 100) if attacks_total > 0 else 0
            
            defends = attacking.get("defends", {})
            defends_total = defends.get("won", 0) + defends.get("lost", 0) + defends.get("stalemate", 0)
            defends_won = defends.get("won", 0)
            defend_winrate = (defends_won / defends_total * 100) if defends_total > 0 else 0
            
            hits = attacking.get("hits", {})
            hits_total = hits.get("success", 0) + hits.get("miss", 0)
            hit_accuracy = (hits.get("success", 0) / hits_total * 100) if hits_total > 0 else 0
            
            formatted["attacks"] = {
                "total": attacks_total,
                "won": attacks_won,
                "lost": attacks.get("lost", 0),
                "stalemate": attacks.get("stalemate", 0),
                "winrate": f"{attack_winrate:.1f}%"
            }
            
            formatted["defends"] = {
                "total": defends_total,
                "won": defends_won,
                "lost": defends.get("lost", 0),
                "stalemate": defends.get("stalemate", 0),
                "winrate": f"{defend_winrate:.1f}%"
            }
            
            formatted["hits"] = {
                "success": hits.get("success", 0),
                "miss": hits.get("miss", 0),
                "accuracy": f"{hit_accuracy:.1f}%"
            }
            
            formatted["damage"] = {
                "total": attacking.get("damage", {}).get("total", 0),
                "best": attacking.get("damage", {}).get("best", 0)
            }
            
            formatted["elo"] = attacking.get("elo", 1200)
            formatted["killstreak"] = attacking.get("killstreak", {}).get("best", 0)
            formatted["one_hit_kills"] = hits.get("one_hit_kills", 0)
        
        # Training stats
        training = personalstats.get("training", {})
        if training:
            formatted["training"] = {
                "strength": training.get("strength", 0),
                "defence": training.get("defence", 0),
                "speed": training.get("speed", 0),
                "dexterity": training.get("dexterity", 0),
            }
        
        # Activity stats (from 'other' section)
        other = personalstats.get("other", {})
        activity_data = other.get("activity", {})
        
        # Activity from regular section (30-day stats)
        activity_30d = personalstats.get("activity", {})
        
        if activity_data or activity_30d:
            formatted["activity"] = {
                "time": activity_data.get("time", 0),
                "attacks": activity_30d.get("attacks", 0) if activity_30d else 0,
                "crimes": activity_30d.get("crimes", 0) if activity_30d else 0,
                "missions": activity_30d.get("missions", 0) if activity_30d else 0,
                "forum_posts": activity_30d.get("forum_posts", 0) if activity_30d else 0,
                "streak": {
                    "current": activity_data.get("streak", {}).get("current", 0),
                    "best": activity_data.get("streak", {}).get("best", 0),
                }
            }
        
        # Drug usage stats
        drugs = personalstats.get("drugs", {})
        if drugs:
            formatted["drugs"] = {
                "cannabis": drugs.get("cannabis", 0),
                "ecstasy": drugs.get("ecstasy", 0),
                "ketamine": drugs.get("ketamine", 0),
                "lsd": drugs.get("lsd", 0),
                "opium": drugs.get("opium", 0),
                "pcp": drugs.get("pcp", 0),
                "shrooms": drugs.get("shrooms", 0),
                "speed": drugs.get("speed", 0),
                "vicodin": drugs.get("vicodin", 0),
                "xanax": drugs.get("xanax", 0),
                "total": drugs.get("total", 0),
                "overdoses": drugs.get("overdoses", 0),
                "rehabilitations": {
                    "amount": drugs.get("rehabilitations", {}).get("amount", 0),
                    "fees": drugs.get("rehabilitations", {}).get("fees", 0),
                }
            }
        
        return formatted


def generate_analysis_summary(analysis: Dict) -> str:
    """
    Generate plain English analysis of member's training, experience, and activity.
    
    Args:
        analysis: Member analysis dictionary
    
    Returns:
        Plain English analysis summary
    """
    if not analysis:
        return "No data available for analysis."
    
    ps = analysis.get("personalstats", {})
    lines = []
    
    # === EXPERIENCE LEVEL ANALYSIS ===
    lines.append("EXPERIENCE LEVEL:\n")
    
    attacks = ps.get("attacks", {})
    defends = ps.get("defends", {})
    total_attacks = attacks.get("total", 0)
    attack_wr = float(attacks.get("winrate", "0%").rstrip('%'))
    defend_wr = float(defends.get("winrate", "0%").rstrip('%'))
    elo = ps.get("elo", 1000)
    
    # Combat experience assessment
    if total_attacks < 100:
        exp_level = "novice"
    elif total_attacks < 500:
        exp_level = "developing"
    elif total_attacks < 2000:
        exp_level = "experienced"
    elif total_attacks < 5000:
        exp_level = "veteran"
    else:
        exp_level = "elite"
    
    lines.append(f"This member is a {exp_level} combatant with {total_attacks} total attacks. ")
    
    # Win rate analysis
    if attack_wr >= 80:
        lines.append(f"Their {attack_wr:.1f}% attack win rate is excellent, indicating strong fighting capability and good target selection. ")
    elif attack_wr >= 70:
        lines.append(f"Their {attack_wr:.1f}% attack win rate is solid, showing competent combat skills. ")
    elif attack_wr >= 60:
        lines.append(f"Their {attack_wr:.1f}% attack win rate is moderate, suggesting they may be challenging themselves or still learning. ")
    else:
        lines.append(f"Their {attack_wr:.1f}% attack win rate is below average, indicating they may be fighting above their level or need more training. ")
    
    # ELO analysis
    if elo >= 2000:
        lines.append(f"With an ELO of {elo}, they compete at an elite level.")
    elif elo >= 1500:
        lines.append(f"Their ELO of {elo} shows strong competitive performance.")
    elif elo >= 1200:
        lines.append(f"Their ELO of {elo} is around average.")
    else:
        lines.append(f"Their ELO of {elo} suggests they are still building combat experience.")
    
    lines.append("\n\n")
    
    # === TRAINING COMMITMENT ANALYSIS ===
    lines.append("TRAINING COMMITMENT:\n")
    
    drugs_data = ps.get("drugs", {})
    total_drugs = drugs_data.get("total", 0)
    xanax = drugs_data.get("xanax", 0)
    rehab_count = drugs_data.get("rehabilitations", {}).get("amount", 0)
    rehab_fees = drugs_data.get("rehabilitations", {}).get("fees", 0)
    
    if rehab_fees > 50_000_000:
        training_level = "very heavy"
    elif rehab_fees > 10_000_000:
        training_level = "heavy"
    elif rehab_fees > 1_000_000:
        training_level = "moderate"
    elif rehab_fees > 0:
        training_level = "light"
    else:
        training_level = "minimal to none"
    
    lines.append(f"Evidence shows {training_level} training investment. ")
    
    if rehab_fees > 0:
        lines.append(f"They have completed {rehab_count} rehabilitations at a total cost of ${rehab_fees:,}, ")
        lines.append(f"indicating they actively use drug-assisted training. ")
        
        if xanax > 500:
            lines.append(f"With {xanax} Xanax used, they focus heavily on defense training. ")
        elif total_drugs > 300:
            lines.append(f"Their {total_drugs} total drugs used shows consistent training habits. ")
        
        # Training dedication assessment
        if rehab_fees > 20_000_000:
            lines.append("This level of investment demonstrates serious dedication to stat development.")
        elif rehab_fees > 5_000_000:
            lines.append("This shows a solid commitment to improving their combat stats.")
    else:
        lines.append("With no rehabilitation history, they likely train naturally or are still early in development.")
    
    lines.append("\n\n")
    
    # === ACTIVITY ANALYSIS ===
    lines.append("ACTIVITY & ENGAGEMENT:\n")
    
    activity = ps.get("activity", {})
    time_played = activity.get("time", 0)
    current_streak = activity.get("streak", {}).get("current", 0)
    best_streak = activity.get("streak", {}).get("best", 0)
    
    days_played = time_played // 1440
    
    if days_played > 1000:
        activity_desc = "long-term veteran"
    elif days_played > 500:
        activity_desc = "established player"
    elif days_played > 180:
        activity_desc = "committed player"
    else:
        activity_desc = "relatively new player"
    
    lines.append(f"This is a {activity_desc} with {days_played} days of game time. ")
    
    # Streak analysis
    if current_streak >= 365:
        lines.append(f"Their current {current_streak}-day login streak is exceptional, demonstrating outstanding dedication. ")
    elif current_streak >= 180:
        lines.append(f"Their {current_streak}-day login streak shows excellent daily engagement. ")
    elif current_streak >= 30:
        lines.append(f"Their {current_streak}-day login streak indicates regular activity. ")
    elif current_streak >= 7:
        lines.append(f"Their {current_streak}-day streak shows recent consistent logins. ")
    else:
        lines.append(f"With a {current_streak}-day streak, they have recently returned or are less consistent. ")
    
    if best_streak > current_streak + 30:
        lines.append(f"Their best streak of {best_streak} days suggests they were previously more active.")
    
    # === COMBAT STYLE ANALYSIS ===
    lines.append("\n\n")
    lines.append("COMBAT STYLE:\n")
    
    best_streak = ps.get("killstreak", 0)
    one_hit_kills = ps.get("one_hit_kills", 0)
    hit_accuracy = float(ps.get("hits", {}).get("accuracy", "0%").rstrip('%'))
    
    if best_streak >= 50:
        lines.append(f"A {best_streak}-kill streak demonstrates exceptional sustained performance in combat. ")
    elif best_streak >= 20:
        lines.append(f"Their {best_streak}-kill streak shows good combat consistency. ")
    
    if one_hit_kills > 500:
        lines.append(f"With {one_hit_kills} one-hit kills, they have significant offensive power. ")
    elif one_hit_kills > 100:
        lines.append(f"Their {one_hit_kills} one-hit kills indicate developing combat strength. ")
    
    if defend_wr < 20:
        lines.append(f"Their {defend_wr:.1f}% defend win rate suggests they are typically outmatched when attacked, ")
        lines.append("which is common for players who punch above their weight or are targeted by stronger opponents.")
    
    return "".join(lines)


def format_personalstats_display(analysis: Dict) -> str:
    """
    Format member analysis for text display.
    
    Args:
        analysis: Member analysis dictionary
    
    Returns:
        Formatted string for display
    """
    if not analysis:
        return "No analysis available"
    
    lines = []
    
    # Header
    lines.append("=" * 70)
    lines.append(f"MEMBER ANALYSIS - {analysis.get('name', 'N/A')} [ID: {analysis['player_id']}]")
    lines.append("=" * 70)
    
    # Basic info
    lines.append("\nBASIC INFO:")
    lines.append(f"  Name:   {analysis.get('name', 'N/A')}")
    lines.append(f"  Level:  {analysis['level']}")
    lines.append(f"  Age:    {analysis['age']} days")
    lines.append(f"  Status: {analysis['status']}")
    
    # Battle stats
    battle = analysis.get("raw_stats", {})
    if battle:
        lines.append("\nBATTLE STATS:")
        lines.append(f"  Strength:  {battle.get('Strength', 0):>12,}")
        lines.append(f"  Defence:   {battle.get('Defence', 0):>12,}")
        lines.append(f"  Speed:     {battle.get('Speed', 0):>12,}")
        lines.append(f"  Dexterity: {battle.get('Dexterity', 0):>12,}")
        total = sum([battle.get(k, 0) for k in ['Strength', 'Defence', 'Speed', 'Dexterity']])
        lines.append(f"  TOTAL:     {total:>12,}")
    
    # Combat performance
    ps = analysis.get("personalstats", {})
    
    if "attacks" in ps:
        lines.append("\nCOMBAT PERFORMANCE:")
        attacks = ps["attacks"]
        lines.append(f"  Attacks:     {attacks['total']} ({attacks['won']} won, {attacks['lost']} lost, {attacks['stalemate']} stalemate)")
        lines.append(f"  Attack WR:   {attacks['winrate']}")
        
        defends = ps["defends"]
        lines.append(f"  Defends:     {defends['total']} ({defends['won']} won, {defends['lost']} lost, {defends['stalemate']} stalemate)")
        lines.append(f"  Defend WR:   {defends['winrate']}")
        
        hits = ps["hits"]
        lines.append(f"  Hit Accuracy: {hits['accuracy']}")
        
        damage = ps["damage"]
        lines.append(f"  Total Damage: {damage['total']:,}")
        lines.append(f"  Best Hit:     {damage['best']:,}")
        lines.append(f"  ELO Rating:   {ps.get('elo', 'N/A')}")
        lines.append(f"  Best Streak:  {ps.get('killstreak', 0)}")
        lines.append(f"  One-Hit Kills: {ps.get('one_hit_kills', 0)}")
    
    # Training
    if "training" in ps:
        lines.append("\nTRAINING INDICATOR:")
        training = ps["training"]
        total_training = sum(training.values())
        if total_training > 0:
            lines.append(f"  Strength:  {training['strength']:>6} points")
            lines.append(f"  Defence:   {training['defence']:>6} points")
            lines.append(f"  Speed:     {training['speed']:>6} points")
            lines.append(f"  Dexterity: {training['dexterity']:>6} points")
            lines.append(f"  TOTAL:     {total_training:>6} points")
        else:
            lines.append("  (No current training)")
    
    # Activity
    if "activity" in ps:
        lines.append("\nACTIVITY:")
        activity = ps["activity"]
        
        # Time played (convert minutes to days/hours)
        time_minutes = activity.get("time", 0)
        time_days = time_minutes // 1440
        time_hours = (time_minutes % 1440) // 60
        lines.append(f"  Time Played: {time_days} days, {time_hours} hours ({time_minutes:,} minutes)")
        
        # Streak
        streak = activity.get("streak", {})
        lines.append(f"  Current Streak: {streak.get('current', 0)} days")
        lines.append(f"  Best Streak:    {streak.get('best', 0)} days")
        
        # Activity stats (30 days)
        lines.append(f"  Attacks (30d):  {activity['attacks']}")
        lines.append(f"  Crimes (30d):   {activity['crimes']}")
        lines.append(f"  Missions (30d): {activity['missions']}")
        lines.append(f"  Forum Posts:    {activity['forum_posts']}")
    
    # Drug usage
    if "drugs" in ps:
        lines.append("\nDRUG USAGE:")
        drugs = ps["drugs"]
        total_drugs = drugs.get("total", 0)
        
        if total_drugs > 0:
            lines.append(f"  Total Used:  {total_drugs}")
            lines.append(f"  Cannabis:    {drugs['cannabis']}")
            lines.append(f"  Ecstasy:     {drugs['ecstasy']}")
            lines.append(f"  Ketamine:    {drugs['ketamine']}")
            lines.append(f"  LSD:         {drugs['lsd']}")
            lines.append(f"  Opium:       {drugs['opium']}")
            lines.append(f"  PCP:         {drugs['pcp']}")
            lines.append(f"  Shrooms:     {drugs['shrooms']}")
            lines.append(f"  Speed:       {drugs['speed']}")
            lines.append(f"  Vicodin:     {drugs['vicodin']}")
            lines.append(f"  Xanax:       {drugs['xanax']}")
            lines.append(f"  Overdoses:   {drugs.get('overdoses', 0)}")
            
            rehab = drugs.get("rehabilitations", {})
            if rehab.get("amount", 0) > 0:
                lines.append(f"  Rehabilitations: {rehab['amount']} (${rehab['fees']:,} total fees)")
        else:
            lines.append("  (No drug usage recorded)")
    
    # Add plain English analysis summary
    lines.append("\n" + "=" * 70)
    lines.append("\nMEMBER ASSESSMENT:")
    lines.append("=" * 70)
    summary = generate_analysis_summary(analysis)
    lines.append(summary)
    
    lines.append("\n" + "=" * 70)
    
    return "\n".join(lines)
