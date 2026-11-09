# Community technology signature data

Unmodified source snapshot from https://github.com/enthec/webappanalyzer at commit
c708f0b2894cee70bb3b2eddde37dcb05595800c. This project continues the formerly open
Wappalyzer technology definitions; it is not the current proprietary Wappalyzer
browser extension or commercial API. Original source and notices are retained in
README.md, LICENSE and src/. The data is licensed GPL-3.0; retain this license and
source notices when redistributing and comply with its applicable terms.

SOURCE.json records the pinned revision and SHA-256 hashes of original upstream
files. The application reads these files locally on the backend; website content
is not sent to the upstream project. No automatic download occurs during scanning.
The adapter/worker/probe were implemented separately in src/services; upstream data
files have not been edited. To update deliberately, review the pinned revision in
scripts/update-technology-signatures.cjs and run that script, then run detector and
browser security tests. A source update requires rebuild/redeploy of the backend.
