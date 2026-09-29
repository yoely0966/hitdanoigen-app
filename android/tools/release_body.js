// Prints the GitHub "create release" JSON for release.sh.
// Non-ASCII characters (Yiddish) are written as \uXXXX escapes, because Windows command lines
// mangle them when the JSON is handed to curl as an argument.
// Usage: node release_body.js v1.7.6 notes.txt
const fs = require('fs');
const [tag, file] = process.argv.slice(2);
const json = JSON.stringify({ tag_name: tag, name: tag, body: fs.readFileSync(file, 'utf8'), draft: false, prerelease: false });
process.stdout.write(json.replace(/[^\x00-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
