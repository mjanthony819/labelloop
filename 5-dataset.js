// Synthetic demo dataset for LabelLoop.
//
// Generated deterministically in code. These are invented comments in the style
// of feedback a small education nonprofit might collect after free community
// classes. No real person's feedback, no scraped or reused dataset. The seed is
// fixed so the app, tests and benchmark all see identical rows.

import { mulberry32, choice, randInt, permutation } from "./rng.js";

export const CLASSES = ["teaching", "pace", "materials", "support", "facilities", "schedule"];

export const CLASS_LABELS = {
  teaching: "Teaching quality",
  pace: "Pace & workload",
  materials: "Materials & resources",
  support: "Staff support",
  facilities: "Facilities & space",
  schedule: "Scheduling & logistics",
};

const TOPICS = ["loops", "fractions", "essay writing", "python basics", "public speaking",
  "algebra", "circuits", "reading comprehension", "data types", "photosynthesis",
  "spreadsheets", "map reading"];

const TEMPLATES = {
  teaching: [
    "The instructor explained {topic} so clearly that it finally clicked for me",
    "I loved how the teacher used real examples for {topic}",
    "The trainer rushed through the explanation and I still don't get {topic}",
    "Great teaching this week, the step by step demo of {topic} helped a lot",
    "The mentor knows the subject but struggles to explain it simply",
    "Best class so far, the way {topic} was broken down made it easy",
    "The teaching felt flat, just reading off slides about {topic}",
    "Instructor answered every question patiently and checked we understood",
    "I wish the teacher would explain {topic} with more worked examples",
    "The tutor made a hard topic feel approachable, really skilled teaching",
    "Explanations are clear but the teacher sometimes assumes we know basics",
    "The way the coach corrected my mistakes was kind and useful",
  ],
  pace: [
    "Too much homework this week, I could not keep up",
    "The course moves too fast for beginners like me",
    "I liked the slower pace, it gave me time to practice",
    "We covered three chapters in one session and I am lost",
    "The workload is manageable if you study a little every day",
    "Please slow down, many of us are falling behind",
    "The pace picked up after week two and now it feels right",
    "I finished all the exercises early, could we move quicker",
    "Assignments pile up faster than I can finish them",
    "Good rhythm this week, not too fast and not boring",
    "The revision week helped me catch up on the backlog",
    "Sessions feel rushed at the end because we start slow",
  ],
  materials: [
    "The worksheets are excellent, I keep them for revision",
    "The slides have too much text and I cannot read them",
    "Please share the practice problems before class",
    "The reading list links are all broken",
    "I loved the handouts, especially the summary sheets",
    "The example code in the notes does not run",
    "More practice questions would really help",
    "The cheat sheet for {topic} is genuinely useful",
    "Videos are blurry and the audio is hard to hear",
    "The workbook answers have mistakes in week three",
    "Could we get the templates as editable files",
    "Printed packets ran out again on Tuesday",
  ],
  support: [
    "Staff replied to my email within a day, very supportive",
    "I asked for help twice and nobody responded",
    "The teaching assistant stayed late to help me debug",
    "Office hours are really helpful, thank you for offering them",
    "I felt comfortable asking questions, the team is kind",
    "My mentor checks in on me every week and it keeps me going",
    "Support chat takes days to answer simple questions",
    "Volunteers at the desk were friendly and patient",
    "I got one on one help with my project and it made a difference",
    "Nobody told me who to contact when I was stuck",
    "The coordinator resolved my enrollment issue quickly",
    "Encouraging feedback from the staff keeps me motivated",
  ],
  facilities: [
    "The classroom is too small for forty people",
    "Air conditioning was broken all week and it was hard to focus",
    "Love the new study room, quiet and bright",
    "The wifi keeps dropping during online sessions",
    "Chairs are uncomfortable for three hour classes",
    "The lab computers are slow and need updating",
    "Clean and well lit venue, easy to reach by bus",
    "The projector flickers and we can barely see the board",
    "Not enough power outlets in the main hall",
    "The library corner is a great place to revise",
    "Restrooms were not clean on Saturday",
    "Parking is a nightmare before evening classes",
  ],
  schedule: [
    "Morning classes clash with my part time job",
    "Please post the timetable earlier, I plan my week around it",
    "The session was rescheduled twice with no notice",
    "Weekend batches work perfectly for me",
    "Class started twenty minutes late again",
    "I missed the deadline because the dates changed",
    "Evening slots after six would suit working students",
    "The calendar invite had the wrong link",
    "Thank you for adding a second batch, mornings were full",
    "Breaks between sessions are too short to grab lunch",
    "Final exam date still not confirmed and it is stressing me out",
    "Holiday schedule was shared well in advance, appreciated",
  ],
};

// Cross-theme comments: the vocabulary points one way, the real complaint the
// other. They make the triage problem realistic - this is where active learning
// earns its keep, because the model is genuinely unsure about them.
const AMBIGUOUS = [
  { text: "The instructor goes too fast when explaining new topics", label: "pace" },
  { text: "Evening classes are great but the hall is freezing by seven", label: "facilities" },
  { text: "I emailed about the timetable change and never heard back", label: "support" },
  { text: "The practice sheet is fine but we get through it too quickly", label: "pace" },
  { text: "The teacher is brilliant but her slides are impossible to read", label: "materials" },
  { text: "Classes keep moving days and the room notice is always late", label: "schedule" },
  { text: "Mentor is kind in person but the whatsapp group goes unanswered", label: "support" },
  { text: "The projector broke mid explanation and we lost half the lesson", label: "facilities" },
  { text: "Homework links in the workbook point to last year's page", label: "materials" },
  { text: "I understand the topic in class then the assignment feels unrelated", label: "teaching" },
  { text: "Batch timings changed so often I missed the unit test", label: "schedule" },
  { text: "The substitute teacher just read the handout aloud", label: "teaching" },
];

const FILLERS = [
  "Overall I am glad I joined.",
  "Thanks for running this program.",
  "Hope this helps.",
  "Just my two cents.",
  "", "", "",
];

const OPENERS = ["", "", "", "Honestly,", "To be fair,", "Small thing:", "Quick note:"];

function typo(text, rng) {
  // Light, realistic noise: one adjacent-letter swap or dropped letter.
  if (text.length < 12) return text;
  const words = text.split(" ");
  const candidates = [];
  words.forEach((w, i) => {
    if (w.length > 5 && /^[a-zA-Z]+$/.test(w)) candidates.push(i);
  });
  if (!candidates.length) return text;
  const wi = choice(rng, candidates);
  let w = words[wi];
  const pos = 1 + randInt(rng, w.length - 2);
  if (rng() < 0.5) {
    w = w.slice(0, pos) + w[pos + 1] + w[pos] + w.slice(pos + 2);
  } else {
    w = w.slice(0, pos) + w.slice(pos + 1);
  }
  words[wi] = w;
  return words.join(" ");
}

export function generate({ nPerClass = 60, seed = 7 } = {}) {
  // Deterministic for a given seed. About one item in five gets a typo, one in
  // five is lowercase-only, and some get a filler sentence appended.
  const rng = mulberry32(seed);
  const texts = [];
  const labels = [];
  for (const cls of CLASSES) {
    const templates = TEMPLATES[cls];
    const ambig = AMBIGUOUS.filter((a) => a.label === cls);
    for (let i = 0; i < nPerClass; i++) {
      // One in six rows per class is a cross-theme comment.
      let t;
      if (i % 6 === 5 && ambig.length) {
        t = ambig[Math.floor(i / 6) % ambig.length].text;
      } else {
        t = templates[i % templates.length];
      }
      if (t.includes("{topic}")) t = t.replace("{topic}", choice(rng, TOPICS));
      const opener = choice(rng, OPENERS);
      if (opener) t = `${opener} ${t[0].toLowerCase()}${t.slice(1)}`;
      const filler = choice(rng, FILLERS);
      if (filler) t = /[.!]$/.test(t) ? `${t} ${filler}` : `${t}. ${filler}`;
      if (rng() < 0.2) t = typo(t, rng);
      if (rng() < 0.2) t = t.toLowerCase();
      texts.push(t);
      labels.push(cls);
    }
  }
  const order = permutation(rng, texts.length);
  return { texts: order.map((i) => texts[i]), labels: order.map((i) => labels[i]) };
}

export function demoRows(seed = 7) {
  // Rows shaped like an uploaded CSV: id, text, label (as ground truth).
  const { texts, labels } = generate({ seed });
  return texts.map((t, i) => ({ id: `demo-${String(i).padStart(4, "0")}`, text: t, label: labels[i] }));
}
