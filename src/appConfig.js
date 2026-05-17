// ================================================================
//  DHS APPLICATION SYSTEM — CONFIG
//  This is the only file you need to edit.
// ================================================================

// Role required to open /application dashboard
export const DASHBOARD_ROLE = ‘1403369460571832372’;

// Role required to use /application-management and review/accept/deny
export const STAFF_ROLE = ‘1496312707907977387’;

// Channel where completed applications are posted for staff review
export const SUBMISSION_CHANNEL = ‘1400610319524561076’;

// ––––––––––––––––––––––––––––––––
//  RANKS & QUESTIONS
//
//  Add each rank as an object with:
//    id        — Discord role ID
//    questions — array of question objects
//
//  Two question types:
//
//    Text (free response):
//    { id: ‘q1’, type: ‘text’, prompt: ‘Why are you applying?’ }
//
//    Multiple choice (max 5 options):
//    { id: ‘q2’, type: ‘choice’, prompt: ‘How active are you?’, choices: [‘Daily’, ‘3-4x/week’, ‘Rarely’] }
//
//  Rules:
//    - Question IDs must be unique within the same rank (q1, q2, q3…)
//    - If a rank has an empty questions array, users get a “not set up” message
//    - Ranks still need to be enabled via /application-management to show up
// ––––––––––––––––––––––––––––––––

export const RANKS = [
{
id: ‘1400534988709036032’,
questions: [
{ id: ‘q1’, type: ‘text’,   prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’,   prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘choice’, prompt: ‘How active are you weekly?’, choices: [‘1-2 days’, ‘3-4 days’, ‘5-6 days’, ‘Every day’] },
{ id: ‘q4’, type: ‘text’,   prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1400535371380424855’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
{ id: ‘q4’, type: ‘text’, prompt: ‘What makes you stand out?’ },
],
},
{
id: ‘1400535311909519472’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1400534498717990922’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1400534430509961297’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1400534336066949191’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1400533823112085655’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1400533726450159708’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1496621256533999626’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1496622105079320728’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1496620834796601395’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1496618836751814757’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
{
id: ‘1400533214887411773’,
questions: [
{ id: ‘q1’, type: ‘text’, prompt: ‘What is your Roblox username?’ },
{ id: ‘q2’, type: ‘text’, prompt: ‘How long have you been in DHS?’ },
{ id: ‘q3’, type: ‘text’, prompt: ‘Why are you applying for this rank?’ },
],
},
];