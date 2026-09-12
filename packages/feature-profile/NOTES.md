# Feature: Profile
## Status: Scaffolded

## What's Done
- ProfilePage with 5 sections: Target Roles, Skills, Experience, Projects, Certifications
- SkillsSection: skill chips sorted by confidence score, colour-coded by level
- ExperienceSection: card per experience with bullets and skill tags
- ProjectsSection: card with impact statement, tech stack tags, optional link
- CertificationsSection: list with award icon
- RoleInterestsSection: target role chips with seniority, domains, remote flag
- Read-only display seeded from MOCK_PROFILE in packages/api

## Next Steps
- Add edit/add modals for each section
- Skills: inline confidence level slider
- Experience: date picker for start/end dates
- Projects: tech stack multi-select
- Add form validation (required fields)
- Connect to real backend PATCH /api/profile

## Dependencies
- @onfile/core (UserProfile, Skill, Project, Experience, Certification, RoleInterest)
- @onfile/ui (PageHeader)
- @onfile/api (getProfile, updateProfile)
