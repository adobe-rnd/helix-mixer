module.exports = {
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', {
      changelogFile: 'CHANGELOG.md',
    }],
    ["@semantic-release/npm", {
      npmPublish: false,
    }],
    ['@semantic-release/git', {
      assets: ['package.json', 'package-lock.json', 'CHANGELOG.md'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
    }],
    ['@semantic-release/exec', {
      prepareCmd: 'HLX_FASTLY_ID=$HLX_FASTLY_CI_ID HLX_FASTLY_AUTH=$HLX_FASTLY_CI_AUTH HLX_CLOUDFLARE_NAME=helix-mixer-ci npm run deploy:ci && npm run test-postdeploy',
      publishCmd: 'HLX_CLOUDFLARE_NAME=helix-mixer npm run deploy:production',
      successCmd: 'echo "${nextRelease.version}" > released.txt',
    }],
    '@semantic-release/github',
  ],
  branches: ['main'],
};
