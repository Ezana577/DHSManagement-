// ================================================================
//  DHS APPLICATION SYSTEM — CONFIG
// ================================================================

export const STAFF_ROLE        = '1496312707907977387';
export const SUBMISSION_CHANNEL = '1400610319524561076';
export const OPERATIONS_CHIEF_ROLE = '1496312716707627099';

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

  // ── Ranks with questions still being configured ────────────
  {
    id: '1496312716707627099',
    name: 'Operations Chief',
    questions: [
      { id: 'q1', type: 'text', prompt: 'What is your Roblox username?' },
      { id: 'q2', type: 'text', prompt: 'What is your Discord username?' },
      { id: 'q3', type: 'text', prompt: 'How long have you been in DHS?' },
      { id: 'q4', type: 'text', prompt: 'Why are you applying for Operations Chief?' },
      { id: 'q5', type: 'text', prompt: 'What leadership experience do you have?' },
    ],
  },
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
