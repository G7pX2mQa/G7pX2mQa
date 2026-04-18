# Agent guidelines: SUPER IMPORTANT MUST READ

- Do **not** modify `styles.css` or `bundle.js`; these files are generated automatically. Any requested changes to styling or JavaScript should be made in the source files that feed the build process, not in the generated bundles.
- If a change appears to require editing the generated files, stop and ask for clarification instead.
- Do **not** modify `package-lock.json`; this current repo doesn't have a license but prod will.
- When creating new keys to save to localStorage, it is VERY important that all entries start with the prefix ccc and end with the current slot number.
