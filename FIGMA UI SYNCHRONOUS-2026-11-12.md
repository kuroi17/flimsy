# FIGMA UI SYNCHRONOUS

_Source: ChatGPT_  
_Link: <https://chatgpt.com/c/6ae32757-6ce8-83ec-9344-22e3cf887b35>_  
_Model: gpt-6_  
_Created: 2026-10-29T11:00:39.957Z_  
_Updated: 2026-11-11T16:59:19.871Z_  

## Human

_Oct 29, 2026, 7:04 PM_

[https://github.com/riecodes/palitada](https://github.com/riecodes/palitada)  
hey chat familairize with this repo sa taas.

and ito namang idea ko nung oct 6 pa.  
project idea:\  
\  
create an extension where when the website and the code inside vscode tapos when the dev wanna modify or just change the position sa ui inside vscode, is automatically nagssync yung code

may similarities right ? my idea naman kasi is di lang sya text but all the elements in the localhost page. Kumbaga ang idea ko is parang figma na halos lahat is nagagalaw diba ? like image, text, components and ganon tapos ang maganda sa idea nato once u finalized the design na sa localpage sa kakalikot ganon is magssync naman yung code.&#x20;

why do this ? mostly kasi currently napapansin ko is when the assets or elements or components is di maayos is diba ang workflow is parang nagsscreenshot pa tau and send sa ai ide along with the prompt pero ang sa atin is manual asikakso or pwede naman when u clicked some or selecred some elemtents or anything is pwede mong iask sa ai ganon. what do u think ? brief and concise perspective. personally i believe my idea will have more edge e.

---

## Assistant

_Oct 29, 2026, 7:04 PM_

**Tool call: `q7dr546`**

```json
[json]
{"query":"The user asks me to familiarize myself with the GitHub repository https://github.com/riecodes/palitada and compare it with their Oct 6 idea: a VS Code/browser extension that lets developers visually select and move/edit any localhost UI elements (text, images, components, layout) in a Figma-like interface, sync those changes back to source code, and optionally ask AI about selected elements. Need any prior discussion or details about this idea or Palitada if previously discussed."}
```

<details><summary>Thinking</summary>

Reviewed Oct 6 ideas, Palitada understanding, localhost editor, and visual editing plans

</details>

<details><summary>Thinking</summary>

Worked for 12s

</details>

bro HAHAHA 😭 **yes, sobrang lapit ng Palitada sa idea mo noong October 6.** Familiarized na ako sa repo and read its README. Pero may important distinction: your original vision goes beyond what Palitada currently does.

## Palitada vs. your idea

[![v0 Vercel vs Lovable (2026): Which AI App Builder Wins?](https://cdn.hostadvice.com/2026/06/v0-vercel-vs-lovable-14.png)](https://fi.hostadvice.com/ai-app-builders/lovable-vs-vercel-v0/)

**Palitada** — [GitHub repo](https://github.com/riecodes/palitada)

Current implementation

- Click an element on localhost.  
- Edit literal text directly.  
- Queue deletions and comments for Claude Code, with source context and screenshots.  
- Works with React, Next.js, Astro, Laravel Blade, and other HTML-serving apps. ([GitHub](https://github.com/riecodes/palitada?utm_source=chatgpt.com "GitHub - riecodes/palitada: Click any element on your local dev page to edit its text, delete it, or hand it to Claude Code."))

---

[![FD4B: カードとコンテナシステムを作成する – Figma Learn - ヘルプセンター](https://help.figma.com/hc/article_attachments/36278760725399)](https://help.figma.com/hc/ja/articles/30987538800023-FD4B-%E3%82%AB%E3%83%BC%E3%83%89%E3%81%A8%E3%82%B3%E3%83%B3%E3%83%86%E3%83%8A%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E3%82%92%E4%BD%9C%E6%88%90%E3%81%99%E3%82%8B)

**Your October 6 concept** — visual editing + bidirectional code sync

- Select and move elements, images, text, components, and layouts.  
- Adjust sizes, spacing, positions, and styles visually.  
- Automatically reflect changes in the actual source code.  
- Select an element and ask AI to modify that specific part.

## My honest take

**Your idea has real potential, but the broader concept isn't unique anymore.** Similar tools now include moldui, Airship, and Glide. They already cover substantial parts of visual editing, source-code updates, and AI-assisted workflows. ([Visual editor for real codebases](https://moldui.vercel.app/?utm_source=chatgpt.com "moldui"), [Visual editor for your codebase.](https://www.airship.design/?utm_source=chatgpt.com "Airship"), [GitHub](https://github.com/SrivarsanK/Glide?utm_source=chatgpt.com "GitHub - SrivarsanK/Glide: Local visual design tool for React, Vue and Svelte. Click any element on a live canvas, edit styles and layout visually, and Glide writes the changes directly back to your source code - no cloud, no proprietary formats."))

But I wouldn't abandon your idea.

Your strongest opportunity is to build a **frictionless visual editing layer for AI-assisted development**:

- No screenshots or manually explaining which component is broken.  
- Click, drag, adjust, and immediately see the result.  
- Ask AI about the exact selected element, with its source context.  
- Preserve the developer's existing codebase rather than generating a separate mockup.

The hardest part isn't making elements draggable. It's translating visual changes into clean, maintainable code without breaking responsive layouts, reusable components, or application logic.

**My verdict:** Palitada validates the problem you're thinking about, but your full vision is a more ambitious product. The next step isn't adding more features blindly; it's researching those newer competitors and identifying a concrete workflow they don't handle well. That's where your edge could be.

---

## Human

_Oct 29, 2026, 7:13 PM_

one thing nakita ko sa mga product na nirecommend mo is yung kapag may changes kang ginawa sa design layout mode like nilakihan mo or binago mo color or font size or anything is need pa ng ai model to implement those changes right ? so ganto ang workflow

design layout page -> the user modify some -> he prompt with ai like claude -> claude implement those changes

my idea kasi is&#x20;

design layout page -> the user modify some -> the user click the button done or something-> the code is automatically synced to that changes&#x20;

- yung ai assisted is nandon pero optional lang sya like nung kay palitada, every time u click some elements text sa kanya, may nalabas na input field right ? sa atin is ganon pero nakabutton lang sya and when clicked is syaka lang lalabas.&#x20;

my edge ? no need for ai and tokenn usage  and parang figma. what do u think ? brief and concise perspective

---

## Assistant

_Oct 29, 2026, 7:13 PM_

bro, **mas gets ko na ngayon yung actual edge ng idea mo.** HAHAHA 😭

You're not building another AI coding assistant. You're building a **Figma-like visual editor that directly modifies the actual codebase.**

| Workflow | Existing AI-assisted approach | Your idea |  
|---|---|---|  
| Change font size/color | AI implements the change | Direct code update |  
| Move or resize elements | Prompt AI to adjust layout | Drag and adjust visually |  
| AI usage | Often needed for implementation | Optional |  
| Code synchronization | AI generates the changes | Automatic after clicking Done |

### My honest perspective

**Yes, your differentiation is stronger than I initially thought.** The real selling point is not simply visual editing—it's *deterministic visual-to-code synchronization without requiring an AI model.*

Three things make or break it:

- **Instant feedback:** changes appear in the browser and sync to source code.  
- **Code quality:** preserve existing components, CSS conventions, and responsive behavior.  
- **Reliable mapping:** understand which source-code styles control the selected visual element.

One caveat: direct manipulation without AI isn't entirely new, so you still need to compare existing editors that support direct source updates.

**My verdict:** Worth prototyping. Start with React + Tailwind, support text, colors, spacing, sizing, and positioning, then sync those changes directly. Keep AI as an optional assistant for complex modifications.

The killer experience is simple: **if I can visually fix my UI faster than I can explain the fix to AI, your tool has a reason to exist.**

---

## Human

_Oct 29, 2026, 7:15 PM_

i also believe i can do this kasi nakikita ko is di masyado marketed well yung mga sinend mo kanina. brief and concise perspective

---

## Assistant

_Oct 29, 2026, 7:15 PM_

bro, honestly, may point ka. HAHAHA 🔥

**A good product doesn't always win because it's first; sometimes it wins because it delivers a better experience and communicates its value better.**

I see two opportunities for you:

- **Product:** Figma-like editing directly on localhost, with automatic code synchronization and optional AI.  
- **Positioning:** Market it as *“Stop prompting AI to fix your UI. Just fix it yourself.”*

Pero one reality check: hindi porket hindi mo sila masyadong nakikita sa marketing means walang traction or competition. You still need to validate demand and compare their actual capabilities.

**My take:** Don't compete on having more features. Compete on making the workflow so intuitive that developers immediately understand why they'd use it.

If you can deliver reliable code synchronization without messing up existing components, that's a compelling product direction.

---

## Human

_Oct 29, 2026, 7:17 PM_

ito motto natin bro : " if I can visually fix my UI faster than I can explain the fix to AI, your tool has a reason to exist."  
"Direct ui changes synced to codebase."

brief and concise perspective. also what product do u think is this ? is this extension or packages / dependencies / app or web or what ? short answer

---

## Assistant

_Oct 29, 2026, 7:17 PM_

bro, 🔥 **that's the product philosophy right there.**

> “If I can visually fix my UI faster than I can explain the fix to AI, your tool has a reason to exist.”  
>
> **Direct UI changes synced to codebase.**

The first is your **product philosophy**; the second is your **core value proposition**.

### What should the product be?

I'd recommend a **local-first developer tool combining a browser extension and a lightweight desktop/CLI companion**.

- **Browser extension:** Select, drag, resize, and edit elements on localhost.  
- **Local companion:** Safely map visual changes to source files and update the codebase.  
- **Optional AI integration:** Handle complex changes beyond direct visual editing.

Start with a Chrome extension + local Node.js companion. You can build a standalone desktop app later if needed.

**Why?** The browser already renders the real UI, while the local companion can access the source code. That's the bridge your product needs.

---

## Human

_Oct 29, 2026, 7:17 PM_

what do u mean by local companion? short answer

---

## Assistant

_Oct 29, 2026, 7:17 PM_

bro, yung **local companion** is a lightweight Node.js server na tumatakbo sa PC ng developer. HAHAHA

Example workflow:

1. **Chrome extension** — click, drag, resize, or change colors sa localhost UI.  
2. **Local companion** — receives those changes and updates the actual source files in VS Code.  
3. **Vite/Next.js hot reload** — automatically reflects the changes sa browser.

Basically, **extension = visual editor; local companion = bridge to your codebase.**

No AI required, no tokens consumed for ordinary visual changes.

---

## Human

_Oct 29, 2026, 7:20 PM_

also my question is, bakit yung nirecommend mong projects kanina is ang products nila is npm packages / dependencies tapos bakit ang atin is recommend mo ay chrome extension + local companion ? short answer

---

## Assistant

_Oct 29, 2026, 7:20 PM_

bro, kasi magkaiba yung **integration approach** natin. 

- **NPM package / dependency:** Developer installs it inside their project. Mas direct ang access sa framework, components, at build process, pero kailangan ng integration sa bawat project.  
- **Chrome extension + local companion:** Developer can visually edit a running localhost website, habang yung companion ang nag-a-update ng source files. Mas malapit sa vision mong parang Figma na gumagana sa existing projects.

**My recommendation:** Huwag muna mag-commit sa architecture. Possible rin ang hybrid approach: Chrome extension for visual editing + npm package or dev server for framework-aware code synchronization.

Ang dapat mag-determine ng architecture ay kung paano natin maaasahang mamamapa ang bawat visual change sa tamang source code—not kung alin ang mas cool na tech stack.

---

## Human

_Oct 29, 2026, 7:22 PM_

bro may edge naman talaga tong atin right ? ano nga pala pwede natin motto here ? brief and concise

---

## Assistant

_Oct 29, 2026, 7:22 PM_

bro, **yes, may potential edge talaga tayo.** 🔥 Our differentiation is direct visual-to-code synchronization without requiring AI for ordinary UI changes. Ang challenge is making it reliable across real-world codebases.

### Motto natin

> **“If I can visually fix my UI faster than I can explain the fix to AI, your tool has a reason to exist.”**

### Product tagline

**“Edit visually. Sync directly to code.”**

Personally, ito ang bet ko. Short, clear, and communicates exactly what the product does.

No unnecessary prompting. No tokens for simple changes. Just **design → sync → done.**

---

## Human

_Nov 12, 2026, 12:54 AM_

bro what if ang gawin natin is npm package talaga or dependency since pwede naman diba  inside the ide is magrun ng localhost ng ating project right?? short answer

---

## Assistant

_Nov 12, 2026, 12:54 AM_

BRO YES. HAHAHA. That's actually a very viable architecture. 🔥

You can build it as an **NPM package / development dependency**.

Workflow:

1. Install: `pnpm add -D your-package`  
2. Run your project locally inside VS Code.  
3. Run your visual editor through a development command.  
4. Open the visual editor in the browser.  
5. Modify UI elements visually.  
6. Click **Done** → changes are written directly to the source code.

**Why I like this approach:**  
- No separate Chrome extension required initially.  
- Easier access to the project's source files.  
- Can integrate with Vite, Next.js, and React.  
- Easier project-specific configuration.

One important challenge: framework-aware source-code mapping.

**My recommendation: Prototype the NPM approach first.** It might be the simplest route toward our motto:

*Direct UI changes synced to codebase.*

---

## Human

_Nov 12, 2026, 12:57 AM_

ito motto natin bro : " if I can visually fix my UI faster than I can explain the fix to AI, your tool has a reason to exist."  
"Direct ui changes synced to codebase."

yan bro. can u pls bro produce the prd now? remember pls our motto and goal.   
sa npm dependencies or packages na tayo or npx ganon or npm install na tayo magdirection bro

---

## Assistant

_Nov 12, 2026, 12:57 AM_

<details><summary>Thinking</summary>

Worked for a couple of seconds

</details>

BRO. HAHAHA. Let's formalize this. 🔥

I recommend we build this as an **NPM-based developer tool with an NPX-first experience**.

Why NPX? Developers can try it without manually installing and configuring a dependency first. Underneath, it's still an npm package that we can distribute and maintain.

Our product isn't another AI coding assistant. It's a visual UI editor that makes AI unnecessary for ordinary visual modifications.

Here's our initial PRD. I've kept the scope realistic enough to build an MVP while preserving the bigger vision.

```text
# PRD: Visual-to-Code Synchronization Tool

**Working Product:** TBD  
**Product Type:** NPM-based Developer Tool / Local Visual UI Editor  
**Initial Distribution:** NPX CLI  
**Status:** Initial Product Requirements Document  
**Version:** 1.0

---

# 1. Product Vision

Build a developer tool that allows developers to visually modify their actual running web applications and automatically synchronize those modifications with their existing source code.

Think of Figma-like visual editing, but instead of producing a separate design file, every supported visual modification is translated into actual code changes.

Developers should be able to select, move, resize, reposition, and modify UI elements directly inside their localhost application without manually editing CSS or prompting an AI model.

AI assistance will remain optional for complex modifications.

## Our Motto

> "If I can visually fix my UI faster than I can explain the fix to AI, your tool has a reason to exist."

**Core Value Proposition:**

> Direct UI changes synced to codebase.

---

# 2. Problem Statement

Current AI-assisted development workflows often require developers to:

1. Identify a UI problem.
2. Take a screenshot or manually inspect the application.
3. Explain the desired modification to an AI coding assistant.
4. Wait for the AI to interpret and implement the changes.
5. Review the generated code.
6. Repeat the process if the result isn't correct.

This introduces unnecessary friction, especially for simple visual adjustments.

Examples:
- Moving a button slightly to the right.
- Increasing an image's width.
- Adjusting padding and margins.
- Changing font sizes and colors.
- Repositioning components.
- Fixing alignment and spacing.

These modifications shouldn't require an AI model.

**Our solution:** Let developers make these modifications visually and synchronize the changes directly into their source code.

---

# 3. Target Users

### Primary Users
- Frontend developers.
- Full-stack developers.
- Indie hackers and solo developers.
- Students building web applications.
- Developers using AI-powered IDEs.

### Supported Development Environments

Initial focus:
- VS Code and compatible IDEs.
- Localhost development environments.
- React applications.
- Vite development servers.
- Tailwind CSS projects.

Future support:
- Next.js.
- Other React-based frameworks.
- Vue.
- Svelte.
- Additional CSS frameworks.

---

# 4. Product Experience

## Core Workflow

**Developer starts their project → Launches our visual editor → Modifies the UI → Clicks Done → Changes synchronize to source code.**

Detailed workflow:

1. Developer opens an existing web project.
2. Runs the tool using NPX.
3. The tool connects to the running development environment.
4. A visual editing interface becomes available in the localhost application.
5. Developer selects any supported UI element.
6. An editing toolbar or contextual panel appears.
7. Developer modifies the selected element.
8. Changes are previewed immediately.
9. Developer clicks Done / Apply Changes.
10. The tool writes the corresponding modifications into the actual source files.
11. The development server reflects the updated code through hot reload.

**Important:** The visual editor must operate on the actual rendered application, not a separate mockup or design canvas.

---

# 5. Core Features and Requirements

## 5.1 Visual Element Selection

Users must be able to select individual elements directly from their running application.

Supported initial elements:
- Text.
- Images.
- Buttons.
- Containers.
- Divs.
- Basic components.
- Links.
- Input fields.

Requirements:
- Display a selection outline.
- Identify the selected element.
- Display its relevant properties.
- Show the corresponding source-code location when available.
- Support nested element selection.

## 5.2 Direct Visual Editing

Users must be able to modify elements without AI assistance.

Initial editing capabilities:

**Typography**
- Font size.
- Font family.
- Font weight.
- Text alignment.
- Text color.
- Line height.

**Spacing**
- Margin.
- Padding.
- Gap.
- Element positioning.

**Dimensions**
- Width.
- Height.
- Minimum and maximum dimensions.

**Appearance**
- Background color.
- Border.
- Border radius.
- Opacity.
- Shadows.

**Positioning and Layout**
- Drag and reposition elements.
- Resize elements using visual handles.
- Adjust alignment.
- Modify basic flexbox and grid properties.

All supported modifications must update the browser preview immediately.

## 5.3 Direct Code Synchronization

This is the most important feature of the entire product.

When users click Done / Apply Changes, the tool must translate their visual modifications into actual source-code changes.

Requirements:
- Modify existing source files instead of generating unrelated files.
- Preserve existing application functionality.
- Preserve component structure whenever possible.
- Respect existing CSS and styling conventions.
- Avoid unnecessarily duplicating CSS rules.
- Avoid replacing entire components for simple style changes.
- Support undo and redo.
- Provide a preview of pending changes before applying them.
- Detect conflicting or externally modified source files.

The synchronization process must not require an AI model.

## 5.4 Optional AI Assistance

AI is an additional capability, not a requirement.

Users can select an element and explicitly open an AI assistance option.

Example requests:
- "Make this button more modern."
- "Improve the spacing of this section."
- "Make this component responsive."
- "Redesign this card while preserving its functionality."

The AI receives:
- Selected element information.
- Relevant source-code context.
- Current styles.
- User instructions.

AI-generated modifications must be previewed before being applied.

**Important:** Basic visual modifications must never depend on AI availability or AI credits.

## 5.5 Selection Toolbar

When an element is selected, display a contextual editing toolbar.

Potential actions:
- Edit properties.
- Drag / resize.
- Duplicate.
- Delete.
- Undo.
- Ask AI.
- View source.
- Apply changes.

The AI option should be accessible but not intrusive.

## 5.6 Change Management

Users should have control over their modifications.

Requirements:
- Track pending changes.
- Apply changes.
- Discard changes.
- Undo and redo.
- Show modified source files.
- Warn before overwriting conflicting changes.

---

# 6. Technical Direction

## Distribution Strategy: NPX + NPM

Recommended initial command:

`npx visual-editor dev`

The exact package name and command are still TBD.

NPX allows developers to launch the tool without manually installing it as a permanent dependency.

The package will contain the CLI and the underlying visual editing infrastructure.

## Proposed Architecture

### A. CLI / Local Development Server

Responsibilities:
- Detect the project environment.
- Identify the framework.
- Locate source files.
- Start the visual editing server.
- Communicate with the frontend overlay.
- Handle source-code modifications.

### B. Browser-Based Visual Editor

Responsibilities:
- Inspect rendered DOM elements.
- Handle element selection.
- Display editing controls.
- Preview visual modifications.
- Maintain pending changes.
- Communicate modifications to the local server.

### C. Source-Code Synchronization Engine

Responsibilities:
- Map rendered elements to their source files.
- Identify relevant JSX/TSX elements.
- Translate visual changes into source-code modifications.
- Preserve existing code structure.
- Apply changes safely.

### D. Optional AI Integration

Responsibilities:
- Process natural-language requests.
- Understand selected components.
- Suggest complex UI modifications.
- Generate optional code changes.

AI must remain independent of the core visual editing and synchronization engine.

---

# 7. Technical Stack (Proposed)

| Layer | Proposed Technology |
|---|---|
| CLI | Node.js |
| Package distribution | NPM / NPX |
| Visual editor | React |
| Browser integration | DOM inspection / injected overlay |
| Source parsing | Babel / TypeScript AST |
| Code modification | AST transformations |
| Styling support | CSS / Tailwind CSS |
| Development integration | Vite plugin / framework adapters |
| Communication | Local WebSocket |
| Testing | Vitest / Playwright |

These are proposed technologies, not mandatory final decisions.

The implementation should favor AST-based source transformations over fragile regex replacements.

---

# 8. MVP Scope

The first version must prove one thing:

**Can a developer visually modify an existing localhost application and reliably synchronize those changes into its actual source code without AI?**

### MVP Features

1. Launch through NPX.
2. Connect to a local React + Vite application.
3. Inject a visual editing overlay.
4. Select rendered UI elements.
5. Modify text, colors, font sizes, spacing, widths, and heights.
6. Preview changes immediately.
7. Click Done to synchronize changes into source files.
8. Support basic undo and discard.
9. Show which source files were modified.
10. Preserve the original application functionality.

### Explicitly Out of Scope for MVP

- Full Figma replacement.
- Complete design system management.
- Complex animations.
- Advanced responsive breakpoint editing.
- Arbitrary component restructuring.
- Visual database or backend editing.
- Full multi-framework compatibility.
- Mandatory AI integration.
- Cloud collaboration.

---

# 9. Non-Functional Requirements

**Performance**
- Minimal impact on the running application.
- Immediate visual feedback.
- No unnecessary external API calls.

**Reliability**
- Never silently overwrite unrelated source code.
- Maintain source-code integrity.
- Provide recovery mechanisms for failed modifications.

**Privacy**
- Local-first architecture.
- No mandatory cloud services.
- No mandatory AI provider.
- Source code stays on the developer's machine.

**Developer Experience**
- Simple installation and launch.
- Minimal configuration.
- Clear error messages.
- Compatible with existing development workflows.

---

# 10. Success Metrics

The MVP is successful when:

1. A developer can launch the tool in an existing supported project.
2. A developer can select and modify rendered elements visually.
3. Changes can be committed directly into the correct source files.
4. The application retains its functionality after synchronization.
5. Simple visual changes require zero AI tokens.
6. Developers can complete common UI adjustments faster than explaining them to an AI coding assistant.

---

# 11. Biggest Technical Challenges

These are the areas requiring the most research and experimentation.

**1. DOM-to-Source Mapping**

How can we reliably identify the JSX/TSX source element responsible for a rendered DOM element?

**2. Code Synchronization**

How can we translate visual changes into clean, maintainable source-code modifications?

**3. Styling Conflicts**

What happens when a selected element uses Tailwind classes, CSS modules, inline styles, or shared component styles?

**4. Component Reusability**

What happens when multiple instances of the same React component exist? Should a modification affect one instance or every instance?

**5. Responsive Layouts**

How can we ensure that visual changes don't unintentionally break other screen sizes?

These challenges should influence our architecture from the beginning.

---

# 12. Product Principles

Every major product decision must follow these principles:

1. **Visual-first:** Developers should be able to fix ordinary UI problems directly.
2. **Code-native:** Changes must become real source-code modifications.
3. **AI-optional:** AI should enhance the workflow, never become a dependency for basic editing.
4. **Developer-controlled:** Developers decide when changes are applied.
5. **Framework-aware:** Respect existing project architecture and styling conventions.
6. **Local-first:** Keep the development workflow private and independent of cloud services.

---

# 13. Final Product Philosophy

> "If I can visually fix my UI faster than I can explain the fix to AI, your tool has a reason to exist."

**Direct UI changes synced to codebase.**

We aren't building another AI coding assistant.

We are building a visual editing layer that bridges the gap between what developers see in their browsers and the actual code that powers those interfaces.

**Design → Modify → Sync → Done.**

No unnecessary prompting. No AI tokens for ordinary visual changes. Just direct visual editing connected to the real codebase.
```

## My recommendation before we start coding

_(Recommended direction)_ **NPX-first, NPM-powered.**

One architectural decision I want us to take seriously:

**Don't promise universal framework support immediately.**

Start with React + Vite + Tailwind. Prove that DOM-to-source mapping and direct code synchronization actually work. Those two technologies will determine whether this product becomes genuinely useful or just another visual editor.

Our first technical milestone should be:

- Select a button on localhost.  
- Change its background color and padding.  
- Click Done.  
- Inspect the actual `.tsx` file and see clean source-code changes.  
- Reload the page and confirm the changes persist.

If we nail that, we have the foundation of our product.

---

## Human

_Nov 12, 2026, 12:59 AM_

ano nga pala project natin for this bro? wala pa right? short answer

---

## Assistant

_Nov 12, 2026, 12:59 AM_

Yes bro! HAHAHA. Wala pa tayong actual project/codebase. 

Meron na tayo:  
- Product vision and motto.  
- Initial PRD.  
- Proposed architecture and tech stack.  
- MVP scope.

**Next step:** Create the repository and establish the project structure. 🔥

---
