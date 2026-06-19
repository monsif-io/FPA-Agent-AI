#!/bin/bash
# deploy.sh
# Deploys the FPA-Agent-AI Next.js app to Render using the Render API.

# Get API_KEY from environment or .env.local
API_KEY="${RENDER_API_KEY}"
if [ -z "$API_KEY" ]; then
  if [ -f "Message-Client/.env.local" ]; then
    API_KEY=$(grep "^RENDER_API_KEY=" Message-Client/.env.local | cut -d'=' -f2- | xargs)
  fi
fi

if [ -z "$API_KEY" ]; then
  echo "❌ RENDER_API_KEY is not set. Please set it in Message-Client/.env.local"
  exit 1
fi

OWNER_ID="tea-d8qam8dckfvc73e1mtdg"
REPO_URL="https://github.com/monsif-io/FPA-Agent-AI"
SERVICE_NAME="fpa-collections-agent"

echo "======================================================"
echo " 🚀 DEPLOYING TO RENDER"
echo "======================================================"

# Read environment variables from .env.local to form the JSON array
echo "Reading environment variables..."
ENV_VARS_JSON="["
FIRST=true

while IFS= read -r line || [ -n "$line" ]; do
  # Skip comments, empty lines, and the deploy API key itself
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^RENDER_API_KEY=.*$ ]] && continue
  
  # Extract key and value
  KEY=$(echo "$line" | cut -d'=' -f1)
  VALUE=$(echo "$line" | cut -d'=' -f2-)
  
  # Escape quotes for JSON
  KEY_ESC=$(echo "$KEY" | sed 's/"/\\"/g' | xargs)
  VALUE_ESC=$(echo "$VALUE" | sed 's/"/\\"/g' | xargs)
  
  if [ -n "$KEY_ESC" ] && [ -n "$VALUE_ESC" ]; then
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      ENV_VARS_JSON="$ENV_VARS_JSON,"
    fi
    ENV_VARS_JSON="$ENV_VARS_JSON{\"key\":\"$KEY_ESC\",\"value\":\"$VALUE_ESC\"}"
  fi
done < "Message-Client/.env.local"

ENV_VARS_JSON="$ENV_VARS_JSON]"

# Prepare payload JSON
echo "Preparing JSON payload..."
PAYLOAD=$(cat <<EOF
{
  "type": "web_service",
  "name": "$SERVICE_NAME",
  "ownerId": "$OWNER_ID",
  "repo": "$REPO_URL",
  "branch": "main",
  "autoDeploy": "yes",
  "rootDir": "Message-Client",
  "envVars": $ENV_VARS_JSON,
  "serviceDetails": {
    "env": "node",
    "plan": "free",
    "region": "oregon",
    "pullRequestPreviewsEnabled": "no",
    "envSpecificDetails": {
      "buildCommand": "npm install && npm run build",
      "startCommand": "npm run start"
    }
  }
}
EOF
)

echo "Sending request to Render API to create service..."
RESPONSE=$(curl -s -X POST "https://api.render.com/v1/services" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Check response
ERROR_MSG=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('message', ''))" 2>/dev/null)
SERVICE_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
SERVICE_URL=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('url', ''))" 2>/dev/null)

if [ -n "$SERVICE_ID" ]; then
  echo "✅ Service created successfully!"
  echo "ServiceID: $SERVICE_ID"
  echo "URL: $SERVICE_URL"
  echo "You can monitor build logs in your Render dashboard or check the deployment status."
else
  echo "❌ Failed to create service."
  echo "Response:"
  echo "$RESPONSE"
  exit 1
fi
