# -------------------------------
# 0) Reproduce + prove this is a platform-level 404 (not Next.js HTML 404)
# -------------------------------
curl -sSIL https://shelfsync-six.vercel.app/ | sed -n '1,40p'
curl -sS https://shelfsync-six.vercel.app/ | head -n 20

# Pull the official meaning of NOT_FOUND + common 404 causes (CLI-only “look online”)
curl -sS https://vercel.com/docs/errors/NOT_FOUND | sed -n '1,120p'
curl -sS https://vercel.com/kb/guide/why-is-my-deployed-project-giving-404 | sed -n '1,160p'
curl -sS https://vercel.com/docs/headers/response-headers | sed -n '1,160p'

# -------------------------------
# 1) Sanity-check monorepo layout + Next app presence using your repomix file
# -------------------------------
ls -la
rg -n '<file path="apps/web/package\.json">' repomix-output.xml -n
rg -n '<file path="apps/web/next\.config\.mjs">' repomix-output.xml -n
rg -n '<file path="apps/web/src/app/page\.tsx">' repomix-output.xml -n
rg -n '<file path="apps/web/vercel\.json">' repomix-output.xml -n

# Confirm the actual Next dependency and that pages exist
node -p "require('./apps/web/package.json').dependencies.next"
ls -la apps/web/src/app
ls -la apps/web/public

# -------------------------------
# 2) Fix your script failure: use `vercel list [project]` (no `--project` flag)
# -------------------------------
npx vercel whoami
npx vercel teams list
npx vercel project inspect shelfsync --scope josues-projects-43dae7c3
npx vercel list shelfsync --prod --scope josues-projects-43dae7c3

# (Optional) Find latest production deployment URL from the list output:
# - copy the topmost URL shown by `vercel list shelfsync --prod`

# -------------------------------
# 3) Confirm project settings via API (framework is the likely culprit if preset shows "Other")
#    - do NOT print your token; keep it in a shell var
# -------------------------------
TEAM_ID="team_LiF6iqWyU68cGy3ik0bAIts5"
PROJECT="shelfsync"
VERCEL_TOKEN="$(node -p "require(process.env.HOME + '/.config/vercel/auth.json').token")"

curl -sS \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/$PROJECT?teamId=$TEAM_ID" \
| node - <<'NODE'
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  const p=JSON.parse(s);
  const pick = {
    id: p.id,
    name: p.name,
    framework: p.framework,
    rootDirectory: p.rootDirectory,
    buildCommand: p.buildCommand,
    outputDirectory: p.outputDirectory,
    installCommand: p.installCommand,
    nodeVersion: p.nodeVersion,
  };
  console.log(JSON.stringify(pick,null,2));
});
NODE

# -------------------------------
# 4) Patch project to Next.js preset (and a safer Node version for Next 14)
#    - this is the CLI-only equivalent of switching “Framework Preset: Other” -> “Next.js”
# -------------------------------
curl -sS -X PATCH \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "framework": "nextjs",
    "nodeVersion": "22.x",
    "buildCommand": null,
    "outputDirectory": null,
    "installCommand": null,
    "devCommand": null
  }' \
  "https://api.vercel.com/v9/projects/$PROJECT?teamId=$TEAM_ID" \
| node -p "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); JSON.stringify({framework:j.framework,nodeVersion:j.nodeVersion,buildCommand:j.buildCommand,outputDirectory:j.outputDirectory,installCommand:j.installCommand},null,2)"

# Re-inspect to confirm the patch stuck
npx vercel project inspect shelfsync --scope josues-projects-43dae7c3

# -------------------------------
# 5) Force a fresh production deploy from the correct root directory
# -------------------------------
npx vercel deploy --prod --cwd apps/web --scope josues-projects-43dae7c3 --logs

# -------------------------------
# 6) Verify the fix: you should now see text/html (not text/plain) for /
# -------------------------------
curl -sSIL https://shelfsync-six.vercel.app/ | sed -n '1,40p'
curl -sS https://shelfsync-six.vercel.app/ | head -n 30

# If still 404, list prod deployments again and inspect the newest deployment URL
npx vercel list shelfsync --prod --scope josues-projects-43dae7c3
# (copy newest deployment URL from the list output, then:)
# npx vercel inspect <PASTE_NEWEST_DEPLOYMENT_URL_HERE> --scope josues-projects-43dae7c3
