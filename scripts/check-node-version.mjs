// Keep local tooling, CI and Workers Builds on the patched Node 22 line.
const [major, minor, patch] = process.versions.node.split('.').map(Number);
if (major !== 22 || minor < 23 || (minor === 23 && patch < 4)) {
  console.error('Tracky requires Node >=22.23.4 <23. Run nvm install && nvm use before installing or building.');
  process.exit(1);
}
