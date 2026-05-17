// ================================================================
//  DHS APPLICATION SYSTEM — CONFIG
// ================================================================

export const STAFF_ROLE             = '1496312707907977387';
export const SUBMISSION_CHANNEL     = '1400610319524561076';
export const OPERATIONS_CHIEF_ROLE  = '1496312716707627099';

// ----------------------------------------------------------------
//  RANKS & QUESTIONS
//  type: 'text'   — free response, user types in DMs
//  type: 'choice' — buttons, max 5 options
// ----------------------------------------------------------------

const HR_QUESTIONS = (rankName) => [
  // ── Basic ──────────────────────────────────────────────────
  { id: 'q1',  type: 'text',   prompt: 'What is your Roblox username?' },
  { id: 'q2',  type: 'text',   prompt: 'What is your Discord username?' },
  { id: 'q3',  type: 'text',   prompt: 'What is your current rank in DHS?' },
  { id: 'q4',  type: 'text',   prompt: 'What is your timezone?' },
  { id: 'q5',  type: 'text',   prompt: 'How long have you been in DHS?' },
  { id: 'q6',  type: 'text',   prompt: 'What previous departments or groups have you worked in?' },

  // ── General ────────────────────────────────────────────────
  { id: 'q7',  type: 'text',   prompt: `Why do you want the position of ${rankName}? Be detailed in your answer.` },
  { id: 'q8',  type: 'text',   prompt: `What sets you apart from other applicants, and why should you be chosen for ${rankName}?` },
  { id: 'q9',  type: 'choice', prompt: 'How active can you be on a weekly basis?',
    choices: ['1–2 hours', '3–5 hours', '6–10 hours', '10+ hours'] },
  { id: 'q10', type: 'choice', prompt: 'How would you rate your leadership skills?',
    choices: ['Poor', 'Average', 'Good', 'Excellent'] },
  { id: 'q11', type: 'choice', prompt: 'How would you rate your aim and combat ability in-game?',
    choices: ['Beginner', 'Average', 'Good', 'Very Experienced'] },
  { id: 'q12', type: 'choice', prompt: 'Two DHS members are arguing during a deployment. What do you do?',
    choices: ['Ignore it', 'Join the argument', 'Calm both sides professionally', 'Punish both instantly'] },
  { id: 'q13', type: 'choice', prompt: 'A lower rank disrespects you. How do you respond?',
    choices: ['Disrespect them back', 'Abuse commands', 'Warn them and report if needed', 'Blacklist them immediately'] },
  { id: 'q14', type: 'choice', prompt: 'Have you ever been punished in DHS before?',
    choices: ['No', 'Yes — explain in the next question'] },
  { id: 'q15', type: 'text',   prompt: 'If you answered yes above, explain what happened. If no, type N/A.' },
  { id: 'q16', type: 'choice', prompt: 'How well can you work under pressure?',
    choices: ['Very poorly', 'Average', 'Good', 'Excellent'] },
  { id: 'q17', type: 'text',   prompt: 'Why should we trust you with authority in DHS?' },

  // ── Scenarios ──────────────────────────────────────────────
  { id: 'q18', type: 'text',   prompt: 'Scenario 1: During a deployment, multiple enemies rush your team and some DHS members begin panicking. What do you do?' },
  { id: 'q19', type: 'text',   prompt: 'Scenario 2: A DHS member is abusing commands while no HR is online. What actions do you take?' },
  { id: 'q20', type: 'text',   prompt: 'Scenario 3: You are leading a raid but your team is not following orders. How do you handle it?' },
  { id: 'q21', type: 'choice', prompt: 'Scenario 4: A member asks for a promotion because they are your friend. What do you do?',
    choices: ['Promote them anyway', 'Ignore them', 'Explain promotions are earned fairly', 'Abuse permissions to help them'] },
  { id: 'q22', type: 'text',   prompt: 'Scenario 5: You notice a member has been inactive for a long period with no notice. What do you do?' },

  // ── Leadership ─────────────────────────────────────────────
  { id: 'q23', type: 'text',   prompt: 'What does being professional mean to you?' },
  { id: 'q24', type: 'text',   prompt: 'How would you improve DHS if given this position?' },
  { id: 'q25', type: 'choice', prompt: 'Are you capable of hosting trainings and deployments?',
    choices: ['Yes', 'No'] },
  { id: 'q26', type: 'choice', prompt: 'Can you stay calm during stressful situations?',
    choices: ['Yes', 'No'] },
  { id: 'q27', type: 'text',   prompt: 'What would you do if DHS started losing a fight badly during a deployment?' },

  // ── Agreement ──────────────────────────────────────────────
  { id: 'q28', type: 'choice', prompt: 'By continuing you agree to the following:\n\n• Using AI to complete this application may result in a blacklist.\n• Inactivity may lead to removal from your position.\n• Abusing permissions or authority will result in punishment.\n• HR members are expected to remain mature and professional.\n• Favoritism, corruption, or admin abuse will not be tolerated.\n• Failing to follow DHS regulations may result in demotion or removal.\n\nDo you agree to all of the above?',
    choices: ['Yes, I agree', 'No, I do not agree'] },
];

const OC_QUESTIONS = [
  // ── Basic ──────────────────────────────────────────────────
  { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
  { id: 'q2', type: 'text', prompt: 'What is your Discord username or ID?' },
  { id: 'q3', type: 'text', prompt: 'What is your current rank in DHS? If you are not DHS personnel, put N/A.' },

  // ── Leadership ─────────────────────────────────────────────
  { id: 'q4', type: 'choice', prompt: 'How would you describe your leadership style?',
    choices: ['Lead from the front', 'Delegate and oversee', 'Adapt to the situation', 'Follow orders strictly'] },
  { id: 'q5', type: 'text', prompt: 'Describe a time you had to make a quick decision under pressure. What happened and what did you decide?' },
  { id: 'q6', type: 'choice', prompt: 'A unit under your command is underperforming during an operation. What is your first action?',
    choices: ['Reassign them immediately', 'Address it calmly and redirect them', 'Report it to higher command', 'Ignore it and continue'] },
  { id: 'q7', type: 'text', prompt: 'What do you think separates a good leader from a great one?' },
  { id: 'q8', type: 'choice', prompt: 'If your superior gives you an order you personally disagree with, what do you do?',
    choices: ['Refuse to follow it', 'Follow it and raise concerns privately', 'Follow it without question', 'Ask for a vote from the team'] },

  // ── Scenarios ──────────────────────────────────────────────
  { id: 'q9',  type: 'choice', prompt: 'Scenario 1: Two criminals are attempting to attack the Vice-Mayor. You have one other Agent with you. What do you do?',
    choices: [
      'Both agents engage the criminals directly',
      'One agent covers the Vice-Mayor while the other engages',
      'Retreat with the Vice-Mayor to a safe position and call backup',
      'Radio for backup and hold position without engaging',
    ] },
  { id: 'q10', type: 'choice', prompt: 'Scenario 2: A Mafia with 4 members is planning to hostage a Whitelisted. You have 2 SRT and 3 HSI online. How do you handle it?',
    choices: [
      'Send all 5 members in at once',
      'Deploy SRT to engage while HSI secures the Whitelisted',
      'Wait for more backup before acting',
      'Send HSI alone since it is an intelligence matter',
    ] },
  { id: 'q11', type: 'choice', prompt: 'Scenario 3: You are protecting the President. Three attackers enter with AK-47s. You have 2 Agents with pistols and 1 Agent with a rifle. How do you respond?',
    choices: [
      'All agents engage the attackers at once',
      'Rifle Agent suppresses attackers while pistol Agents evacuate the President',
      'Evacuate the President immediately and do not engage',
      'Have all agents form a shield around the President and wait',
    ] },
  { id: 'q12', type: 'choice', prompt: 'Scenario 4: You are raiding a Mafia with 3 SRT members against 5 Mafia members. How do you approach this?',
    choices: [
      'Rush in with all 3 SRT members at once',
      'Breach in a stack, clear room by room, and arrest where possible',
      'Wait outside and attempt negotiation first',
      'Call off the raid due to being outnumbered',
    ] },

  // ── Operations Chief Specific ──────────────────────────────
  { id: 'q13', type: 'choice', prompt: 'There is an active operation but no Lead Supervisor (LS) is online and one is required for planning. What do you do?',
    choices: ['Volunteer to fill the LS role', 'Cancel the operation', 'Run the operation without an LS', 'Wait until one comes online'] },
  { id: 'q14', type: 'choice', prompt: 'The Director of Operations in the Executive Branch wants to promote someone to EB. Do you approve?',
    choices: ['Yes, they have the authority', 'No, it requires additional oversight', 'Ask for the promotion criteria first', 'Escalate to higher command'] },
  { id: 'q15', type: 'choice', prompt: 'A task requires a Lead Supervisor and you are available. Do you take it on?',
    choices: ['Yes, always', 'Only if no one else is available', 'No, it is not my responsibility', 'Depends on the task'] },

  // ── Agreement ──────────────────────────────────────────────
  { id: 'q16', type: 'choice', prompt: 'Do you agree that using AI on this application will result in a blacklist?',
    choices: ['Yes, I agree', 'No'] },
  { id: 'q17', type: 'choice', prompt: 'Do you agree to remain active both in-game and on Discord?',
    choices: ['Yes, I agree', 'No'] },
  { id: 'q18', type: 'choice', prompt: 'Do you agree not to ask staff to read or rush your application?',
    choices: ['Yes, I agree', 'No'] },
];

export const RANKS = [
  // ── Ranks with full HR questions ───────────────────────────
  {
    id: '1400534988709036032',
    name: 'Lieutenant',
    questions: HR_QUESTIONS('Lieutenant'),
  },
  {
    id: '1400535371380424855',
    name: 'Senior Lieutenant',
    questions: HR_QUESTIONS('Senior Lieutenant'),
  },
  {
    id: '1400535311909519472',
    name: 'Captain',
    questions: HR_QUESTIONS('Captain'),
  },
  {
    id: '1400534498717990922',
    name: 'Senior Captain',
    questions: HR_QUESTIONS('Senior Captain'),
  },
  {
    id: '1400534430509961297',
    name: 'Major',
    questions: HR_QUESTIONS('Major'),
  },

  // ── Operations Chief ───────────────────────────────────────
  {
    id: '1496312716707627099',
    name: 'Operations Chief',
    questions: OC_QUESTIONS,
  },

  // ── Ranks with questions still being configured ────────────
  {
    id: '1400533214887411773',
    name: 'Director of Operations',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Director of Operations?' },
    ],
  },
  {
    id: '1496618836751814757',
    name: 'Deputy Director of Operations',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Deputy Director of Operations?' },
    ],
  },
  {
    id: '1496620834796601395',
    name: 'Assistant Director of Operations',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Assistant Director of Operations?' },
    ],
  },
  {
    id: '1496622105079320728',
    name: 'Director of Operations Intern',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Director of Operations Intern?' },
    ],
  },
  {
    id: '1496621256533999626',
    name: 'Chief Colonel',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Chief Colonel?' },
    ],
  },
  {
    id: '1400533726450159708',
    name: 'Senior Colonel',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Senior Colonel?' },
    ],
  },
  {
    id: '1400533823112085655',
    name: 'Colonel',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Colonel?' },
    ],
  },
  {
    id: '1400534336066949191',
    name: 'Lieutenant Colonel',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Lieutenant Colonel?' },
    ],
  },
];
