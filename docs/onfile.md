# readme

# **OnFile**

**Personal Technical & Product Design Documentation (Revised Edition)**  
 Author: Raghav Sethi  
 Role: Designer & Engineer  
 Audience: Engineers, collaborators, reviewers, investors

---

# **1\. Executive Overview**

OnFile is a **local-first, AI-powered career intelligence and application optimization system** designed primarily for students and early-career professionals.

Unlike traditional job platforms that focus on job listings, OnFile focuses on **maximizing interview conversion through intelligent automation, structured reasoning, and user-controlled execution.**

The system operates as a desktop application that:

* Deeply understands the user’s structured career profile

* Infers all suitable job roles dynamically

* Discovers opportunities using legally safe ingestion strategies

* Deduplicates and ranks them semantically

* Generates job-specific resumes and answers

* Prepares application drafts automatically

* Submits applications only after explicit user approval

* Provides targeted interview preparation

* Continuously learns from user decisions

OnFile is not a job scraping engine.  
 It is an **AI Career Strategy Engine.**

---

# **2\. Design Philosophy**

## **2.1 Intelligence Over Volume**

The goal is not to apply to 300 jobs.  
 The goal is to maximize interview conversion rate.

Optimization metric:

Interview callbacks per 10 applications.

---

## **2.2 Local-First & User-Controlled**

* No centralized crawling infrastructure

* No mass data harvesting

* User machine performs discovery

* Explicit user approval before submission

* Data privacy by design

This ensures:

* Lower legal risk

* Higher privacy

* Lower infrastructure cost

* Scalable architecture

---

## **2.3 Assistive Automation (Not Autonomous Spam)**

All application submissions follow:

**Prepare → Review → Approve → Submit**

The system never mass-submits unattended applications.

This ensures:

* Compliance stability

* Account safety

* User trust

* Quality control

---

## **2.4 Structured Data Over Text Blobs**

Career data and job data are stored as structured entities:

* Skills

* Role clusters

* Experience units

* Company metadata

* Skill gaps

* Resume fragments

This enables:

* Reasoning

* Explainability

* Ranking transparency

* Intelligent recursion

---

# **3\. Target Users**

Primary:

* Undergraduate students

* Fresh graduates

* Entry-level engineers

Secondary (future):

* Career switchers

* Self-taught developers

* Early-stage professionals optimizing lateral moves

---

# **4\. System Architecture (Revised High-Level)**

`┌──────────────────────────────┐`

`│ Desktop UI                   │`

`│ - Profile Editor             │`

`│ - Job Intelligence Library   │`

`│ - Application Draft Board    │`

`│ - Resume Viewer              │`

`│ - Interview Prep             │`

`└─────────────┬────────────────┘`

              `│`

`┌─────────────▼────────────────┐`

`│ Local Application Core        │`

`│ - Profile Engine              │`

`│ - Role Inference Engine       │`

`│ - Job Discovery Engine        │`

`│ - Ranking & Dedup Engine      │`

`│ - Resume Engine               │`

`│ - Skill Gap Analyzer          │`

`│ - Application Draft Engine    │`

`│ - Interview Engine            │`

`│ - Learning Feedback Loop      │`

`└─────────────┬────────────────┘`

              `│`

`┌─────────────▼────────────────┐`

`│ Local Storage Layer           │`

`│ - SQLite / PostgreSQL         │`

`│ - Job Cache                   │`

`│ - Resume Versions             │`

`│ - Draft Applications          │`

`│ - Interaction Logs            │`

`└──────────────────────────────┘`

---

# **5\. Feature-Level Technical Design**

---

# **5.1 Career Profile Engine (Structured Career Graph)**

Purpose:  
 Convert raw career input into a queryable knowledge graph.

### **Entities**

* Skill

* Project

* Experience

* Achievement

* Certification

* Role Interest

### **Relationships**

* Skill → Used In → Project

* Project → Demonstrates → Skill

* Experience → Requires → Skill

* Skill → Strength Level → Numeric Score

### **Enhancements**

* Skill confidence scoring (frequency × recency × impact)

* Derived skill inference (e.g., REST APIs imply HTTP knowledge)

* Dynamic skill clustering

---

# **5.2 Role Inference Engine**

Purpose:  
 Automatically infer all plausible job roles.

### **Mechanism**

* Role taxonomy JSON

* Skill-to-role matrix

* Weighted scoring algorithm

* Depth weighting (project impact \> shallow exposure)

### **Output**

* Ranked role list

* Role coverage percentage

* Role confidence score

Dynamic updates whenever profile changes.

---

# **5.3 Hybrid Job Discovery Engine (Safe Architecture)**

This is redesigned to ensure sustainability.

## **5.3.1 Ingestion Strategy**

### **Tier 1 – Structured & Permissible Sources**

* Public APIs

* RSS feeds

* Startup career boards

* Government portals

* Company career pages that allow crawling

### **Tier 2 – User-Initiated Browser Assistance**

* Data extraction only from pages the user opens

* No mass unattended crawling

* Session-based automation

---

## **5.3.2 Intelligence-Based Recursion**

Instead of recursive crawling:

The system performs recursive intent expansion:

Example:  
 Backend Intern → FinTech → API-first companies → YC-backed startups

New search queries are generated, not blind crawling.

---

## **5.3.3 Deduplication Strategy**

* Hash: title \+ company \+ location

* Semantic similarity (embedding threshold)

* Fuzzy company name matching

---

## **5.3.4 Scheduling**

* Configurable search intervals

* Rate-limited

* Pause/resume

* Source throttling

---

# **5.4 Intelligent Job Ranking Engine**

Each job receives:

* Skill match score

* Experience alignment score

* Role depth score

* Skill gap penalty

* Seniority compatibility score

Final output:

Interview Probability Score (heuristic model)

---

# **5.5 Skill Gap Analysis Engine**

Purpose:  
 Prevent blind applications.

Output:

* Missing skills ranked by importance

* Readiness percentage

* Suggestion:

  * Apply now

  * Apply after improvement

  * Skip

---

# **5.6 Resume Generation Engine (Advanced Version)**

## **Pipeline**

1. Parse job description

2. Extract required skills

3. Select most relevant experience fragments

4. Rewrite bullets contextually

5. Optimize for ATS keyword density

6. Reorder sections

7. Render LaTeX

8. Export PDF

Template:  
 Jake’s Resume (default)  
 Modular template architecture for future themes.

Explainability:  
 Each included bullet is linked to job requirement.

---

# **5.7 Application Draft Engine (New Core Feature)**

This is a major enhancement.

## **Workflow**

1. User selects job OR system recommends high-score jobs

2. System:

   * Generates tailored resume

   * Generates cover letter

   * Prepares answers to screening questions

   * Simulates form filling (in memory)

3. Stores as Draft Application

Nothing is submitted automatically.

---

# **5.8 Review & Approval Dashboard**

User sees:

* Company

* Role

* Match score

* Missing skills

* Resume preview

* Cover letter preview

* Screening question responses

Actions:

* Edit

* Approve

* Reject

* Schedule submission

---

# **5.9 Controlled Submission Engine**

After user approval:

* Browser session opens

* Form is filled

* Resume uploaded

* Answers inserted

* Submission completed

* Confirmation logged

Risk Mitigation:

* Daily submission cap

* Human-like timing delays

* No unattended 24/7 submission loops

---

# **5.10 Interview Preparation Engine**

Inputs:

* Job description

* Company size/type

* Skill gaps

Outputs:

* Technical questions

* Behavioral prompts

* Project deep-dive questions

* Weakness targeting questions

* Difficulty scaling

---

# **5.11 Feedback Learning Loop (Future)**

System tracks:

* Jobs approved

* Jobs rejected

* Interviews received

Adjusts:

* Ranking weights

* Role priorities

* Resume tone

* Skill importance weighting

---

# **6\. Desktop Platform**

Technology Options:

* Tauri (preferred – lightweight)

* Electron (alternative)

Background Worker:

* Discovery service

* Draft preparation queue

* Safe automation scheduler

---

# **7\. Data Storage**

* Local relational DB

* Indexed job table

* Resume fragment library

* Draft application table

* Submission log table

Future:

* Local embedding store

---

# **8\. Security & Compliance Model**

* No centralized scraping infrastructure

* User-initiated automation

* Explicit submission approval

* No proxy rotation

* No captcha bypassing

* No fake accounts

* Respect source rate limits

Positioning:

AI-assisted application preparation tool.

Not:

Mass application bot.

---

# **9\. Scalability Model**

Scales horizontally by:

* User machines

* Not centralized servers

Cloud optional only for:

* LLM APIs

* Premium features

---

# **10\. Monetization Strategy (Revised)**

Free Tier:

* Profile engine

* Resume generator

* Basic discovery

Premium Tier:

* Advanced tailoring

* Smart draft generation

* Interview engine

* Learning feedback optimization

* Application analytics

---

# **11\. Roadmap**

Phase 1:  
 Profile Engine  
 Resume Generator  
 Role Inference

Phase 2:  
 Hybrid Job Discovery  
 Ranking Engine  
 Skill Gap Analysis

Phase 3:  
 Application Draft Engine  
 Review Dashboard  
 Controlled Submission

Phase 4:  
 Interview Engine  
 Feedback Learning System

---

# **12\. Strategic Positioning**

OnFile is not:

* A job board

* A scraper

* A spam auto-apply bot

It is:

A Personal Career Intelligence Operating System.

Designed to demonstrate:

* System design maturity

* Ethical automation principles

* AI orchestration capability

* Product thinking

* Compliance-aware engineering

* Long-term maintainability

# User flow

## **1️⃣ It Preserves Human Agency**

Platforms primarily care about:

* Automation at scale

* Non-consensual mass activity

If:

* Every submission requires explicit user approval

* The user sees what is being sent

You are acting more like a power tool.

Not a crawler bot.

---

## **2️⃣ It Dramatically Improves Quality**

Most people fail because they:

* Apply too fast

* Don’t customize

* Don’t read job descriptions

Your system becomes:

A strategic application optimizer.

That’s valuable.

---

# **🏗 How This Would Work Technically**

Let’s design it like a serious product.

---

## **Phase 1: Job Detection**

User either:

* Selects jobs from your engine

* Or browses manually

* Or imports job links

System extracts:

* Job title

* Company

* Required skills

* Questions

* Application form structure

---

## **Phase 2: Application Draft Engine**

For each job, system:

1. Tailors resume version

2. Generates cover letter

3. Prepares answers to screening questions

4. Fills form fields in memory (not submitting yet)

5. Stores everything as a “Draft Application”

Nothing gets submitted.

---

## **Phase 3: Review Dashboard**

User sees:

Application \#21  
 Company: X  
 Role: Backend Engineer  
 Match Score: 87%

* View tailored resume

* View cover letter

* View question answers

* Edit anything

* Approve / Reject

This is where your product shines.

---

## **Phase 4: Controlled Submission**

Once user clicks Approve:

Browser automation:

* Re-opens job page

* Fills fields

* Uploads tailored resume

* Pastes final cover letter

* Submits

* Logs confirmation

Then logs:

Application ID  
 Timestamp  
 Status: Submitted

# search engine

# **Hybrid Intelligent Job Discovery Engine**

This is the foundation.  
 If this is weak, everything else collapses.

We will design it:

* Legally safer

* Scalable

* Intelligent

* Local-first

* Structured

---

# **🎯 Objective**

Build a system that:

1. Generates smart job search queries

2. Pulls jobs from allowed / safe sources

3. Extracts structured job data

4. Deduplicates jobs

5. Scores relevance

6. Stores everything locally

7. Updates periodically

Without:

* Aggressive crawling

* Infinite recursion

* Risky mass scraping

---

# **🏗 Architecture Overview**

Internally, your Job Discovery Engine should have 5 modules:

`1. Query Generator`  
`2. Source Adapter Layer`  
`3. Parser & Normalizer`  
`4. Deduplication Engine`  
`5. Ranking Engine`

Let’s build them step by step.

---

# **🔹 STEP 1: Query Generator**

This is where intelligence starts.

## **Input:**

* Inferred roles (from Role Engine)

* Preferred location

* Remote preference

* Experience level

## **Example:**

Role: Backend Engineer Intern  
 Location: Remote / Bangalore

Generate structured queries:

`"Backend Engineer Intern Remote"`  
`"Backend Developer Intern Bangalore"`  
`"Software Engineer Intern Backend Remote"`

---

## **Implementation**

Create:

`class QueryGenerator:`  
    `def generate(role, location, remote_flag):`  
        `# Expand variations`  
        `# Use synonyms`  
        `# Return list of queries`

Add role synonyms:

Backend Engineer →

* Backend Developer

* API Engineer

* Server-side Developer

Store synonym mappings in JSON.

---

# **🔹 STEP 2: Source Adapter Layer**

This is CRITICAL.

Do NOT write scraping logic everywhere.

Create a standardized adapter interface.

`class JobSourceAdapter:`  
    `def search(query: str) -> list[RawJobData]:`  
        `pass`

Now each source implements this:

* Public API adapter

* RSS feed adapter

* Startup board adapter

* Company career page adapter

* User-session browser adapter

---

## **Why This Matters**

You separate:

Search logic  
 from  
 Source extraction logic

This makes the system clean and extensible.

---

# **🔹 STEP 3: Parsing & Normalization**

Raw job data is messy.

You need a unified schema.

Define:

`class NormalizedJob:`  
    `id`  
    `title`  
    `company`  
    `location`  
    `description`  
    `skills_required`  
    `source`  
    `source_url`  
    `posted_date`

Each adapter returns RawJobData.

Parser converts Raw → Normalized.

---

## **Skill Extraction**

Use:

* Regex

* Skill dictionary matching

* Later: NLP keyword extraction

Example:

If description contains:  
 "REST API", "Node.js", "MongoDB"

Match against skill taxonomy.

Store skills as structured list.

---

# **🔹 STEP 4: Deduplication Engine**

Duplicate jobs WILL happen.

Use 3 layers:

## **1️⃣ Exact Hash**

Hash:

`title + company + location`

If identical → skip.

---

## **2️⃣ Fuzzy Matching**

Use:

* Levenshtein similarity

* Or simple string similarity threshold

If similarity \> 0.85 → probable duplicate.

---

## **3️⃣ Semantic Similarity (Future Upgrade)**

Use embeddings:

* Convert description to vector

* Compare cosine similarity

If similarity \> threshold → duplicate.

---

# **🔹 STEP 5: Ranking Engine**

This is where your product differentiates.

For each job:

Compute:

`Skill Match Score`  
`Role Match Score`  
`Experience Alignment`  
`Skill Gap Penalty`  
`Location Preference Score`

Final Score:

`0.4 * skill_match`  
`+ 0.3 * role_alignment`  
`+ 0.2 * experience_alignment`  
`- 0.1 * gap_penalty`

Store this score.

Sort job library by score.

---

# **🔹 STEP 6: Scheduling System**

Create a background worker:

`while True:`  
    `run_job_discovery()`  
    `sleep(configured_interval)`

Add:

* Rate limits per source

* Max jobs per run

* Pause toggle

Never run infinite high-frequency loops.

---

# **🔹 STEP 7: Database Design**

Tables:

`jobs`  
`job_skills`  
`job_sources`  
`search_runs`

Index:

* company

* title

* match\_score

* posted\_date

Use SQLite initially.

---

# **🔹 STEP 8: Intelligence-Based Recursion**

Instead of crawling everything:

When you detect:

Many fintech jobs →  
 Add search term:  
 "fintech backend intern"

When you detect:  
 Frequent Python jobs →  
 Boost Python-based roles

This is query evolution, not crawling recursion.

Much safer.

---

# **🔥 Performance Considerations**

* Async HTTP for API sources

* Sequential execution for sensitive sources

* Cache processed job URLs

* Avoid re-processing old jobs

---

# **🛡 Risk Mitigation Strategy**

If using browser automation:

* Only run on user trigger

* Limit pages per search

* Add delay (1–3 seconds between actions)

* Cap daily operations

---

# **🧠 What Makes This “Smart”**

Not volume.

Not crawling.

But:

* Structured ranking

* Intelligent query expansion

* Deduplication quality

* Skill extraction accuracy

That’s the real engine.

---

# **🧱 MVP Implementation Order**

1. Query Generator

2. One safe source adapter

3. Normalizer

4. Dedup logic

5. Basic ranking

6. Job library UI

# auto application

# **Application Draft & Controlled Auto-Fill Engine**

*(Prepare → Review → Approve → Submit architecture)*

This must be engineered with:

* Safety

* Transparency

* Modularity

* Deterministic control

* Low ToS risk

If done incorrectly → account bans.  
 If done correctly → extremely powerful feature.

---

# **🎯 Objective**

Given:

* A selected job

* A generated tailored resume

* Structured user profile

The system should:

1. Prepare a full application draft

2. Generate answers for screening questions

3. Store everything locally

4. Show it in a review dashboard

5. Submit only after user approval

6. Log submission confirmation

7. Track status over time

No silent mass submissions.

---

# **🏗 High-Level Architecture**

`1. Application Analyzer`  
`2. Draft Generator`  
`3. Draft Storage Layer`  
`4. Review Dashboard`  
`5. Controlled Submission Engine`  
`6. Submission Logger`

Let’s go layer by layer.

---

# **🔹 STEP 1: Application Analyzer**

Before you can fill a form, you must understand it.

There are 2 scenarios:

---

## **Scenario A: Structured Easy Apply (Predictable Fields)**

Fields like:

* Name

* Email

* Resume upload

* Years of experience

* Yes/No eligibility questions

These can be mapped.

---

## **Scenario B: Custom Company Career Pages**

Fields vary:

* Text inputs

* Dropdowns

* File uploads

* Checkboxes

* Essay questions

These require dynamic detection.

---

## **Implementation Strategy**

When user clicks:

“Prepare Application”

System:

1. Opens job page in controlled browser instance

2. Scans DOM for:

   * Input fields

   * Labels

   * Required markers

3. Builds structured representation:

`ApplicationForm:`  
  `fields = [`  
    `{type: "text", label: "Full Name", required: True},`  
    `{type: "textarea", label: "Why do you want this role?", required: True},`  
    `{type: "dropdown", label: "Years of Experience", options: [...]}`  
  `]`

This form model is stored.

You never operate blindly.

---

# **🔹 STEP 2: Draft Generation Engine**

Now generate values for each field.

---

## **Resume Upload**

Use the tailored resume generated earlier.

Store file path in draft.

---

## **Simple Fields**

Name → profile.name  
 Email → profile.email  
 Phone → profile.phone

Map directly.

---

## **Experience Dropdowns**

If field is:

“Years of experience in Python”

Compute:

Based on skill graph.

Return closest numeric match.

---

## **Screening Questions (Hard Part)**

Example:  
 “Why do you want to work here?”

You generate using:

* Company name

* Role

* User experience

* Domain alignment

But must constrain:

* 150–250 words

* No hallucinated facts

* Professional tone

Store answer in draft.

---

## **Safety Constraint**

Never auto-submit at this stage.

Only generate and store.

---

# **🔹 STEP 3: Draft Storage Model**

Create table:

`application_drafts`

Fields:

* draft\_id

* job\_id

* resume\_version\_id

* form\_structure\_json

* filled\_answers\_json

* status \= {drafted, approved, submitted, rejected}

* created\_at

* approved\_at

* submitted\_at

Everything must be traceable.

---

# **🔹 STEP 4: Review Dashboard (Critical UX)**

User sees:

---

## **Company: X**

## **Role: Backend Intern**

## **Match Score: 86%**

## **Resume Version: v12**

Tabs:

* Resume Preview

* Cover Letter

* Screening Answers

* Missing Skills

* Risk Warnings

Buttons:

* Edit Answer

* Regenerate

* Approve

* Reject

No hidden actions.

Transparency builds trust.

---

# **🔹 STEP 5: Controlled Submission Engine**

This must be isolated and rate-limited.

When user clicks “Approve & Submit”:

System:

1. Opens browser session

2. Navigates to job URL

3. Refills form using stored draft values

4. Uploads resume

5. Pastes answers

6. Submits

7. Detects confirmation message

8. Logs submission

---

## **Important Engineering Controls**

* Random delay between field fills (300–1200ms)

* Scroll before click

* One submission per X minutes

* Daily cap (configurable, default 10–20)

* No background 24/7 loop

This mimics human pacing.

---

# **🔹 STEP 6: Submission Confirmation Detection**

After submit:

Look for:

* “Application submitted”

* Confirmation page redirect

* Success banner

If confirmed:

Update draft status → submitted.

If failed:

Flag as error.

Never assume success blindly.

---

# **🔹 STEP 7: Risk Mitigation Strategy**

Never:

* Rotate proxies

* Bypass captchas

* Inject JS aggressively

* Use headless detection bypass hacks

Keep it simple.

If captcha appears → pause and request manual solve.

That’s safer.

---

# **🔹 STEP 8: Application Status Tracking**

After submission:

Allow user to manually update status:

* Submitted

* Viewed

* Interview

* Rejected

* Offer

Or:

Optional feature:  
 Revisit application portal periodically (with limits) to check status.

But keep frequency low.

---

# **🔹 STEP 9: Analytics Layer**

Track:

* Applications sent

* Interview rate

* Response rate per role

* Resume version performance

This closes feedback loop.

---

# **🔥 Why This Architecture Is Strong**

Because:

* Submission requires user approval

* Draft is stored before action

* Everything is logged

* Automation is assistive

* You avoid mass spam behavior

This is sustainable automation.

---

# **🧱 MVP Build Order**

1. Draft model

2. Manual form mapping

3. Simple autofill

4. Approval workflow

5. Submission logger

6. Add AI answers later

Do not start with dynamic form inference.

# application status

# **Application Status Tracking & Feedback Learning Engine**

*(Analytics → Signal Extraction → Resume Optimization → Smarter Targeting)*

---

# **🎯 Objective**

After applications are sent, the system must:

1. Track outcomes

2. Measure performance patterns

3. Detect resume weaknesses

4. Detect job targeting mistakes

5. Adapt ranking and resume generation logic

6. Improve interview conversion rate over time

This creates a feedback loop.

Without this layer, the system is blind.

---

# **🏗 High-Level Feedback Architecture**

`Applications → Status Updates → Outcome Signals`  
                   `↓`  
           `Performance Aggregator`  
                   `↓`  
         `Pattern Detection Engine`  
                   `↓`  
        `Resume & Ranking Optimizer`  
                   `↓`  
      `Smarter Next Job Recommendations`

This is controlled learning — not uncontrolled AI drift.

---

# **🔹 STEP 1: Application Outcome Tracking**

Extend the `application_drafts` table:

Add:

* status: drafted | submitted | viewed | interview | rejected | offer

* response\_time\_days

* interview\_stage (optional)

* rejection\_type (optional)

* notes

Users update manually OR via lightweight polling.

---

## **Smart Status Inference (Optional Advanced)**

For platforms like LinkedIn:

You can detect:

* “Application viewed”

* “Application closed”

But do not poll aggressively.

Max:

* Once every 3–7 days

* Only for recent submissions

* Only when user is active

---

# **🔹 STEP 2: Define Key Metrics**

You need measurable KPIs.

Per 30-day window:

* Applications sent

* Responses received

* Interviews

* Offers

* Response rate \= responses / submissions

* Interview rate \= interviews / submissions

* Offer rate

These are your core signals.

---

# **🔹 STEP 3: Resume Version Performance Tracking**

Each submission is linked to:

`resume_version_id`

So you can compute:

* v12 → 3 interviews / 20 apps

* v13 → 0 interviews / 15 apps

Now you know which version performs better.

You’re not guessing.

---

# **🔹 STEP 4: Skill Gap Pattern Detection**

For rejected applications:

Compare:

Job required skills  
 vs  
 User skill graph

Aggregate across 20–50 rejections:

If repeated gaps appear:

Example:

* 65% of rejected roles required Docker

* 72% required AWS

* 54% required system design

Now you generate:

“High-impact skill recommendation”

Not random advice.

---

# **🔹 STEP 5: Ranking Adaptation Logic**

If roles with:

* Match score \> 80%

* Produce higher interview rate

Then:

Increase weighting of strict skill alignment.

If:

Lower match scores produce interviews

Then:

You may be over-penalizing minor gaps.

This tuning must be deterministic.

Example:

`if interview_rate_high_match > interview_rate_mid_match:`  
    `increase_skill_weight += 0.05`

Do not let LLM tune this directly.

Use structured metrics.

---

# **🔹 STEP 6: Resume Bullet Effectiveness Analysis**

You can go deeper.

For each resume version:

Track which bullet sections differ.

If:

Resume emphasizing “microservices” → more interviews  
 Resume emphasizing “research projects” → fewer interviews

Then:

Increase weight of production experience bullets.

This becomes resume intelligence.

---

# **🔹 STEP 7: Company-Level Insights**

Over time:

Detect:

* Which companies respond faster

* Which domains ignore applications

* Which company size gives interviews

Example:

High response from:

* Mid-size SaaS startups

Low response from:

* Large FAANG-like corporations

Now the engine can recommend better targets.

---

# **🔹 STEP 8: Adaptive Job Feed**

Now modify ranking formula using performance data.

Original ranking:

`score = skill_match * 0.6`  
      `+ experience_match * 0.2`  
      `+ domain_match * 0.2`

After feedback:

Adjust weights dynamically.

Example:

`score = skill_match * 0.7`  
      `+ domain_match * 0.2`  
      `+ company_size_affinity * 0.1`

But changes must be gradual.

No extreme shifts.

---

# **🔹 STEP 9: Feedback Dashboard**

User sees:

---

## **📊 30-Day Performance**

## **Applications: 28**

## **Responses: 6**

## **Interviews: 3**

## **Offers: 0**

## **Response Rate: 21%**

## **📈 Best Performing Resume Version: v14**

## **🎯 High-Impact Missing Skill: AWS**

## **🏢 Best Performing Company Type: Mid-size SaaS**

This gives strategic clarity.

---

# **🔹 STEP 10: Cold Start Handling**

If user has \< 10 applications:

Do not adapt.

Use baseline ranking.

Only enable learning after statistically meaningful volume.

---

# **🔹 STEP 11: Anti-Overfitting Safeguards**

You must prevent:

* Over-optimizing to one company

* Reacting to 2 rejections

* Sudden weight swings

So enforce:

* Minimum 20–30 data points

* Max 10% weight adjustment per cycle

* 30-day rolling window

This keeps learning stable.

---

# **🔥 Why This Changes Everything**

Most job tools:

* Send applications

* Show a count

* Stop there

This system:

* Learns what works

* Identifies skill ROI

* Improves targeting

* Improves resume

* Increases conversion rate over time

This is a career performance engine.

---

# **🧱 Final System Overview**

You now have:

1️⃣ Intelligent Job Ingestion  
 2️⃣ Skill Graph \+ Matching Engine  
 3️⃣ Tailored Resume Generator  
 4️⃣ Controlled Application Draft \+ Submission  
 5️⃣ Feedback Learning Engine

That’s a full-stack autonomous career platform.

# resume generator

# **Resume Generation Engine**

*(Production-grade, ATS-optimized, explainable, modular)*

This is not just “generate a resume.”

This is a **job-specific resume compiler**.

You are building:

A deterministic \+ AI-assisted resume transformation pipeline.

---

# **🎯 Objective**

Given:

* Structured user career graph

* A specific job description

Produce:

* ATS-optimized resume

* Reordered sections

* Rewritten bullet points

* Highlighted skill alignment

* Clean PDF export

* Explainable decisions

---

# **🏗 Architecture Overview**

Your Resume Engine should have 6 internal stages:

`1. Job Description Analyzer`  
`2. Skill & Requirement Extractor`  
`3. Resume Fragment Selector`  
`4. Bullet Rewriting Engine`  
`5. Section Reordering Logic`  
`6. Rendering & Export System`

We’ll build each properly.

---

# **🔹 STEP 1: Job Description Analyzer**

Input:  
 Raw job description text.

Goal:  
 Extract structured requirements.

---

## **Extract:**

* Required skills

* Preferred skills

* Tools

* Years of experience

* Keywords

* Domain hints (FinTech, SaaS, AI, etc.)

---

## **Implementation Strategy**

### **Phase 1 (Rule-Based)**

Use:

* Skill dictionary matching

* Regex for “X years of experience”

* Keyword detection

Example:

If job contains:  
 “Experience with REST APIs and Node.js required”

Extract:

`skills_required = ["REST APIs", "Node.js"]`

---

### **Phase 2 (AI-Assisted Extraction)**

Use LLM to structure output as JSON:

`{`  
  `"required_skills": [],`  
  `"preferred_skills": [],`  
  `"experience_years": 0,`  
  `"domain": ""`  
`}`

Store structured result.

Never operate on raw text after this stage.

---

# **🔹 STEP 2: Resume Fragment Library (Critical Design)**

Instead of generating resume from scratch every time:

You create reusable structured fragments.

---

## **Data Model**

`experience_fragments`  
`project_fragments`  
`achievement_fragments`  
`skill_fragments`

Each fragment includes:

* Raw text

* Skills tagged

* Impact score

* Context tags

* Domain tags

Example:

Fragment:  
 "Built REST API handling 10k daily requests using Node.js"

Tags:  
 \["REST API", "Node.js", "Backend", "Scalability"\]

Impact score:  
 8.5

---

# **🔹 STEP 3: Fragment Selection Algorithm**

Now the intelligence.

Given required job skills:

Compute overlap score between:

Job skills  
 and  
 Fragment skill tags

---

## **Scoring Formula**

`fragment_score =`  
  `(skill_overlap * weight1)`  
`+ (impact_score * weight2)`  
`+ (recency_score * weight3)`

Select:

Top N fragments per section.

---

## **Important**

Never overload resume with everything.

Max:

* 3–4 bullets per experience

* 2–3 major projects

Precision \> verbosity.

---

# **🔹 STEP 4: Bullet Rewriting Engine**

Now comes AI — but controlled.

You do NOT want hallucinated claims.

You want structured rewriting.

---

## **Strategy**

Send LLM:

* Original bullet

* Required job skills

* Tone requirement

* Keep facts unchanged instruction

Example Prompt Logic:

“Rewrite this bullet to emphasize Node.js and REST API experience while preserving all factual claims.”

---

## **Constraints**

* No fabrication

* No adding metrics

* No changing technologies

* Keep impact measurable

---

## **Optional Enhancement**

Add keyword density optimizer:

If job repeats “scalable systems” 5 times:  
 Inject “scalable” into bullet phrasing.

This improves ATS matching.

---

# **🔹 STEP 5: Section Reordering Logic**

Most resumes are static.

Yours should be dynamic.

---

If job emphasizes:

Backend → move backend projects up  
 Frontend → highlight UI projects  
 AI role → surface ML projects

Implement:

`section_priority = compute_alignment(section, job_skills)`

Sort sections accordingly.

---

# **🔹 STEP 6: ATS Optimization Layer**

This is subtle but important.

Add:

* Keyword inclusion verification

* Avoid fancy formatting

* No images

* No multi-column layouts

* Plain bullet formatting

* Standard fonts

Keep it machine-readable.

---

# **🔹 STEP 7: Rendering Pipeline**

You chose:

Jake’s Resume (LaTeX template)

Excellent choice.

---

## **Architecture**

`ResumeData → LaTeX Generator → .tex file → PDF compile`

Create template placeholders:

`{{NAME}}`  
`{{EDUCATION}}`  
`{{EXPERIENCE_SECTION}}`  
`{{PROJECT_SECTION}}`

Populate dynamically.

Compile using local LaTeX engine.

---

# **🔹 STEP 8: Explainability Layer (Power Feature)**

For each included bullet:

Store:

`reason_included:`  
  `- Matches Node.js requirement`  
  `- High impact score`  
  `- Relevant to Backend role`

Display in UI:

“Why this was included.”

This builds trust.

---

# **🔹 STEP 9: Resume Versioning**

Each generated resume:

* Linked to job ID

* Stored with timestamp

* Hash of job description

* Editable copy

Never overwrite previous versions.

This enables:

* A/B testing

* Performance tracking

---

# **🔥 Advanced Feature: Resume Strength Score**

After generation:

Compute:

* Keyword coverage %

* Skill alignment %

* Gap severity %

* Experience alignment %

Display:

“Resume Match: 84%”

This connects to your ranking engine.

---

# **🧠 What Makes This Strong**

Not text generation.

But:

* Structured fragment system

* Deterministic selection

* Controlled rewriting

* Explainability

* Version tracking

* ATS optimization

This is engineering maturity.

---

# **🧱 MVP Implementation Order**

1. Fragment tagging system

2. Rule-based fragment selection

3. Basic LaTeX rendering

4. No AI rewriting initially

5. Add AI rewrite later

6. Add explainability UI

# interview intelligence

# **Interview Intelligence Layer — Complete Implementation Blueprint**

## **🎯 Purpose**

Once:

* `application.status == "interview"`


System automatically prepares:

* Structured prep kit

* Resume-aligned questions

* Company-aware strategy

* Weakness handling guidance

* Mock simulation environment

This is not generic interview advice.

It is job-specific, resume-specific, and performance-oriented.

---

# **🏗 High-Level Architecture**

* `1. Interview Trigger`  
* `2. Interview Type Classifier`  
* `3. Company Context Builder`  
* `4. Resume Signal Extractor`  
* `5. Question Generation Engine`  
* `6. Answer Draft Engine`  
* `7. Mock Interview Simulator`  
* `8. Performance Scoring Module`  
* `9. Interview Data Store`


Let’s go step by step.

---

# **🔹 1️⃣ Interview Trigger System**

Add trigger inside application lifecycle:

* `if application.status == "interview":`  
*     `generate_interview_kit(application_id)`


This ensures:

* No manual prep needed

* Automatic readiness

Store:

* `interview_kits`


Table fields:

* kit\_id

* application\_id

* interview\_type

* company\_profile\_json

* question\_bank\_json

* answer\_drafts\_json

* mock\_scores\_json

* created\_at

  ---

  # **🔹 2️⃣ Interview Type Classifier**

We must detect what type of interview this likely is.

Inputs:

* Job description

* Role title

* Company type

* Seniority

Classifier outputs:

* technical\_coding

* system\_design

* behavioral

* product\_case

* mixed

Implementation:

Deterministic keyword signals:

If description contains:

* "algorithm"

* "leetcode"  
   → technical\_coding

If:

* "architecture"

* "scalability"

* "design distributed"  
   → system\_design

If:

* "stakeholder"

* "collaboration"  
   → behavioral heavy

Fallback:  
 LLM classification with structured JSON output.

Store result in kit.

---

# **🔹 3️⃣ Company Context Builder**

We already have:

* Company name

* Domain

* Job description

Build lightweight profile:

* `{`  
*   `"company_type": "startup | enterprise | fintech | SaaS",`  
*   `"tech_focus": [...],`  
*   `"culture_signals": [...],`  
*   `"product_domain": ...`  
* `}`


Example:

For Stripe

Signals likely:

* API reliability

* Distributed systems

* Financial correctness

* Ownership mindset

We don’t scrape deeply.  
 We infer from job \+ domain classification.

---

# **🔹 4️⃣ Resume Signal Extractor**

From the tailored resume used in this application:

Extract:

* Top 5 technical skills emphasized

* Top 3 major projects

* Leadership signals

* Impact metrics

Convert resume to structured representation:

* `{`  
*   `"primary_skills": ["Python", "Microservices", "PostgreSQL"],`  
*   `"projects": [`  
*     `{"name": "...", "tech": [...], "impact": "..."}`  
*   `],`  
*   `"leadership": [...]`  
* `}`


This ensures questions align to resume.

---

# **🔹 5️⃣ Question Generation Engine**

Generate 3 structured sections.

---

## **A) Technical Questions**

Derived from:

* Required skills

* Resume skills

* Company focus

Rules:

* 5–8 coding/design questions

* Aligned to real job scope

* Avoid random textbook questions

Example logic:

If:  
 Company focus includes distributed systems  
 AND resume includes microservices

Generate:

* Design scalable order processing system

* Debug concurrency issue scenario

  ---

  ## **B) Behavioral Questions (Resume-Aware)**

For each major project:

Generate:

* Tell me about the hardest challenge in X

* What tradeoff did you make?

* Describe conflict or failure

Map questions to actual resume content.

No generic:  
 “Tell me about yourself”

---

## **C) Company-Specific Questions**

Generate:

* Why this company?

* Why this product domain?

* What excites you about this role?

Based on company context builder.

---

# **🔹 6️⃣ Answer Draft Engine**

For each generated question:

Produce structured draft in STAR format.

Structure enforced:

* `Situation:`  
* `Task:`  
* `Action:`  
* `Result:`  
* `Reflection:`


Constraints:

* No hallucinated metrics

* Use resume-provided data only

* Keep answers concise (150–250 words)

Store drafts in:

* `answer_drafts_json`


Editable by user.

---

# **🔹 7️⃣ Weakness & Gap Defense Module**

If earlier system detected:

Skill gaps for this job.

Generate defense strategy:

Example:

Missing Kubernetes:

System suggests:

* Emphasize containerization experience

* Highlight transferable infra knowledge

* Avoid claiming direct production K8s experience

This reduces risk of overclaiming.

---

# **🔹 8️⃣ Mock Interview Simulator**

Interactive mode.

User clicks:

“Start Mock Interview”

System:

* Randomly selects questions from generated bank

* Asks one by one

* Records user responses

After each answer:

Scoring module evaluates.

---

# **🔹 9️⃣ Scoring Rubric Engine**

We do NOT rely on vague “LLM vibes”.

Use structured rubric:

Score 1–5 for:

* Structure clarity

* Relevance

* Technical depth

* Specificity

* Conciseness

Combine:

* `final_score =`  
*     `structure * 0.2`  
*   `+ technical_depth * 0.3`  
*   `+ specificity * 0.2`  
*   `+ relevance * 0.2`  
*   `+ clarity * 0.1`


Return:

* Score

* Improvement suggestions

* Missing detail suggestions

Store in:

* `mock_scores_json`  
    
  ---

  # **🔹 1️⃣0️⃣ Interview Dashboard UX**

User sees:

---

## **Company: X**

## **Role: Backend Engineer**

## **Interview Type: Technical \+ Behavioral**

Tabs:

* Technical Questions

* Behavioral Questions

* Answer Drafts

* Weakness Strategy

* Mock Simulator

* Performance History

Everything structured.

---

# **🔹 1️⃣1️⃣ Longitudinal Improvement Tracking**

If user does multiple mock sessions:

Track:

* Score progression

* Weak dimensions

* Improvement trends

Example:

Session 1 → 62%  
 Session 3 → 78%

This creates measurable prep improvement.

---

# **🔒 Safety & Integrity Rules**

Never:

* Provide leaked real interview questions

* Claim inside knowledge

* Fabricate company-specific internal details

Everything must be inferred from public job description.

---

# **📦 Implementation Order (MVP)**

1. Interview trigger

2. Resume extractor

3. Question generator

4. Answer draft engine

5. Basic mock simulator

6. Scoring rubric

No need for advanced company modeling initially.

# data model

Tables (local SQLite):

### **jobs**

* job\_id

* company

* title

* description

* extracted\_skills\_json

* match\_score

* created\_at

---

### **resume\_versions**

* resume\_id

* base\_or\_tailored

* content\_json

* created\_at

---

### **application\_drafts**

* draft\_id

* job\_id

* resume\_id

* form\_structure\_json

* answers\_json

* status

* created\_at

---

### **interview\_kits**

* kit\_id

* application\_id

* interview\_type

* questions\_json

* answers\_json

* mock\_scores\_json

---

### **insights\_cache**

* rolling\_metrics\_json

* updated\_at

All local.

No remote dependency.

# UI\\UX

# **OnFile — Full UI/UX Architecture**

---

## **1️⃣ Global Layout**

### **Structure**

`----------------------------------------------------------`  
`| Sidebar (vertical, left) | Main Content (dynamic)      |`  
`----------------------------------------------------------`

**Sidebar Items (primary navigation):**

1. Job Feed

2. Resume Studio

3. Applications

4. Interviews

5. Insights

6. Settings

**Sidebar Features:**

* Collapsible (icon-only in compact mode)

* Active tab highlighted

* Optional small status indicator (e.g., jobs discovered today)

**Responsive:**

* Mobile: sidebar collapses into top hamburger menu

* Content fills screen dynamically

**Colors & Style:**

* Minimal, calm, professional

* Background: light gray / white

* Accent: green/blue for actions

* Card borders subtle

---

## **2️⃣ Job Feed Page**

### **Purpose**

Primary hub for job discovery and interaction.

### **Layout**

`----------------------------------------------------------`  
`| Left Panel: Job List        | Right Panel: Job Details  |`  
`----------------------------------------------------------`

### **Left Panel (Job List)**

* **Scrollable vertical list of job cards**

* Each card shows:

  * Company logo / icon

  * Role title

  * Match % badge (green/yellow/gray)

  * Missing skills mini-badge

  * Status: Draft / Approved / Submitted / Interview

* Card hover:

  * Quick actions: “Prepare Resume”, “View Details”

### **Right Panel (Job Detail)**

* **Job description** (collapsible sections for clarity)

* **Required skills** with match highlights (skills user has vs missing)

* **Resume used for application** (dropdown to select)

* **Action buttons**:

  * “Prepare Application” → opens Application Draft

  * “Mark as Interested” → tracks jobs for future

### **Interaction Notes**

* Infinite scroll or pagination

* Sorting / filtering panel:

  * Match %

  * Location (if relevant)

  * Date posted

  * Job type (full-time / internship / contract)

* Clicked job updates URL hash → allows direct linking

---

## **3️⃣ Resume Studio Page**

### **Purpose**

Manage base and tailored resumes, preview changes per job.

### **Layout**

**Split view:**

`-------------------------------`  
`| Left: Resume Versions       |`  
`| Right: Preview / Editor     |`  
`-------------------------------`

### **Left Panel**

* **List of resume versions**

  * Base resume

  * Tailored versions per job

* Options:

  * Create New Version

  * Delete / Duplicate

  * Compare (diff view)

### **Right Panel**

* **Resume Preview**

  * Rendered PDF-style or structured HTML

  * Highlight modifications:

    * Green → Added

    * Gray → Removed

* Editable fields for each section:

  * Skills

  * Projects

  * Experience

  * Achievements

* **Export Buttons**

  * PDF

  * JSON for backup

### **Interaction Notes**

* Drag-and-drop section reordering

* Inline editing → updates underlying structured resume JSON

* Responsive:

  * Mobile: list \+ preview stacked vertically

* UX Goal: Show AI optimizations clearly without overwhelming

---

## **4️⃣ Applications Dashboard**

### **Purpose**

Track all application progress in a **Kanban-style pipeline**.

### **Layout**

`---------------------------------------------------------`  
`| Drafted | Approved | Submitted | Interview | Offer     |`  
`---------------------------------------------------------`

### **Each Column**

* Scrollable vertical list of job cards

* Card shows:

  * Company

  * Role

  * Resume version used

  * Match %

  * Submission date / status

* Drag & drop card → changes status (optional; manual override)

### **Card Details (on click)**

* Full job info

* Resume version used

* Application draft preview

* Submission button (requires user approval)

* Log of automated actions performed by OnFile

### **Filters & Sorting**

* By role type

* By date added

* By match %

### **UX Notes**

* Pipeline provides **visual clarity of career progress**

* Subtle animations when moving cards for engagement

* Responsive:

  * Mobile: swipe between columns

---

## **5️⃣ Interview Kit Page**

### **Purpose**

Prepare, simulate, and track mock interviews.

### **Layout**

**Top-level tabs**

1. Questions

2. Answer Drafts

3. Mock Simulator

4. Performance History

### **Questions Tab**

* List of all generated questions

* Sections:

  * Technical

  * Behavioral

  * Company-specific

* Click question → shows context, expected answer notes

### **Answer Drafts Tab**

* Editable answer drafts

* STAR format enforced:

  * Situation

  * Task

  * Action

  * Result

  * Reflection

* Highlight incomplete sections or missing info

### **Mock Simulator Tab**

* **Interactive question-by-question interface**

* Timer optional

* User types / speaks answer

* Score panel visible (structure, clarity, relevance, technical depth)

### **Performance History Tab**

* Charts showing:

  * Average score per category (technical / behavioral / company)

  * Progress over time

* Suggestions for improvement

### **UX Notes**

* Encourage iterative learning

* Avoid overwhelming: focus on one question at a time

* Mobile: linear view, swipe to next question

---

## **6️⃣ Insights Page**

### **Purpose**

Provide **career progress metrics**.

### **Layout**

**Dashboard with cards and charts**

* Cards:

  * Total Applications

  * Response Rate

  * Interview Rate

  * Best Resume Version

  * Top Missing Skill

* Charts:

  * Applications over time (bar chart)

  * Interviews over time (line chart)

  * Match % distribution (pie chart)

### **Interaction Notes**

* Hover → tooltip with extra info

* Click on metric → drill down (e.g., which resume led to highest match %)

---

## **7️⃣ Settings Page**

### **Purpose**

Configure **local preferences**.

### **Layout**

**Sections:**

1. App Behavior

   * Daily submission cap

   * Job scraping interval

2. Resume Preferences

   * Default template

   * Export path

3. AI / LLM

   * User API key

   * Optional offline model settings

4. Backup & Restore

   * Export DB

   * Restore DB

### **UX Notes**

* Clear separation between local-only options and AI features

* Provide **tooltips** for technical options

---

## **8️⃣ Common UI Components**

1. **Cards**

   * Job card, resume card, application card

   * Hover states with action buttons

2. **Modals**

   * For confirmations (e.g., before submitting application)

   * For editing resume sections

3. **Badges**

   * Match %, missing skills, status indicators

4. **Tabs**

   * Interview sections, settings subsections

5. **Notifications / Toasts**

   * Successful export

   * Auto job found

   * Application ready for review

6. **Filters / Search**

   * Job list, resume search, application filters

---

## **9️⃣ Responsive Strategy**

* Desktop: Split panels, sidebar persistent

* Tablet: Sidebar collapsible, panels stacked or side-by-side depending on width

* Mobile: Sidebar → hamburger menu, stacked panels, simplified dashboards

---

## **10️⃣ UX Principles**

1. **Transparency**

   * Show AI decisions (resume tailoring, match %)

2. **Control**

   * Never auto-submit without approval

3. **Calm**

   * Minimal animations, subtle colors

4. **Focus**

   * Only show relevant info per page / per job

5. **Progress Feedback**

   * Insights page gives a “career dashboard” feel

# prompt

