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
