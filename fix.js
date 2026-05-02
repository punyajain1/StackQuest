const fs = require('fs');

function fixLogin() {
  const file = 'mobile/src/app/auth/login.jsx';
  let content = fs.readFileSync(file, 'utf8');

  // Extract Field component
  const fieldMatch = content.match(/const Field = \(\{[\s\S]*?\}\) => \([\s\S]*?<\/View>\n\);\n\n/);
  if (!fieldMatch) {
    console.log("Could not find Field in login.jsx");
    return;
  }
  const fieldCode = fieldMatch[0];

  // Remove the Field definition AND the extra export
  content = content.replace(fieldCode, '');
  content = content.replace(/export default function LoginScreen\(\) \{\n  return \(/g, '  return (');

  // Insert Field after imports
  content = content.replace(/export default function LoginScreen\(\) \{/, fieldCode + 'export default function LoginScreen() {');

  fs.writeFileSync(file, content);
  console.log("Fixed login.jsx");
}

function fixSignup() {
  const file = 'mobile/src/app/auth/signup.jsx';
  let content = fs.readFileSync(file, 'utf8');

  const inputFieldMatch = content.match(/const InputField = \(\{[\s\S]*?\}\) => \([\s\S]*?<\/View>\n\);\n\n/);
  if (!inputFieldMatch) {
    console.log("Could not find InputField in signup.jsx");
    return;
  }
  const inputFieldCode = inputFieldMatch[0];

  content = content.replace(inputFieldCode, '');
  content = content.replace(/export default function SignupScreen\(\) \{\n  return \(/g, '  return (');

  content = content.replace(/export default function SignupScreen\(\) \{/, inputFieldCode + 'export default function SignupScreen() {');

  fs.writeFileSync(file, content);
  console.log("Fixed signup.jsx");
}

fixLogin();
fixSignup();
