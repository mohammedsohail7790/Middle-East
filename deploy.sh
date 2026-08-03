#!/usr/bin/env bash
# ============================================================================
# Call IQ — Production Deployment Script
# Usage:
#   ./deploy.sh [environment] [service]
#   ./deploy.sh production gateway
#   ./deploy.sh staging dashboard
#   ./deploy.sh production all
# ============================================================================
set -euo pipefail

ENVIRONMENT="${1:-production}"
SERVICE="${2:-all}"

echo "=== Call IQ Deployment ==="
echo "Environment: ${ENVIRONMENT}"
echo "Service:     ${SERVICE}"
echo ""

load_env() {
    local env_file=".env.${ENVIRONMENT}"
    if [[ -f "${env_file}" ]]; then
        echo "Loading ${env_file}..."
        set -a
        source "${env_file}"
        set +a
    elif [[ -f ".env" ]]; then
        echo "Warning: ${env_file} not found, falling back to .env"
        set -a
        source ".env"
        set +a
    else
        echo "Error: No environment file found"
        exit 1
    fi
}

build_all() {
    echo "=== Building all packages ==="
    npm ci
    npm run build:packages
    npm run build:apps
    echo "Build complete"
}

build_gateway() {
    echo "=== Building gateway ==="
    npm ci
    npm run build:packages
    npm run build:gateway
    echo "Gateway build complete"
}

build_dashboard() {
    echo "=== Building dashboard ==="
    npm ci
    npm run build:dashboard
    echo "Dashboard build complete"
}

docker_deploy() {
    local service="$1"
    echo "=== Deploying ${service} via Docker ==="
    docker-compose -f docker-compose.yml -f docker-compose.production.yml build "${service}"
    docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d "${service}"
    echo "${service} deployed"
}

render_deploy() {
    local service_name="$1"
    local clear_cache="${2:-false}"
    echo "=== Triggering Render deploy for ${service_name} ==="

    local service_id=""
    case "${service_name}" in
        gateway) service_id="${RENDER_GATEWAY_SERVICE_ID:-}" ;;
        dashboard) service_id="${RENDER_DASHBOARD_SERVICE_ID:-}" ;;
        *) echo "Unknown Render service: ${service_name}"; exit 1 ;;
    esac

    if [[ -n "${RENDER_API_KEY:-}" && -n "${service_id}" ]]; then
        local clear_flag="do_not_clear"
        if [[ "${clear_cache}" == "true" ]]; then
            clear_flag="clear"
        fi
        curl -sf -X POST "https://api.render.com/v1/services/${service_id}/deploys" \
            -H "Authorization: Bearer ${RENDER_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"clearCache\":\"${clear_flag}\"}"
        if [[ "${clear_cache}" == "true" ]]; then
            curl -sf -X POST "https://api.render.com/v1/services/${service_id}/cache/purge" \
                -H "Authorization: Bearer ${RENDER_API_KEY}" || true
        fi
        echo "Render API deploy triggered for ${service_name} (clearCache=${clear_flag})"
        return
    fi

    local deploy_hook_key=""
    case "${service_name}" in
        gateway) deploy_hook_key="${RENDER_GATEWAY_DEPLOY_HOOK_KEY:-}" ;;
        dashboard) deploy_hook_key="${RENDER_DASHBOARD_DEPLOY_HOOK_KEY:-}" ;;
    esac

    if [[ -z "${deploy_hook_key}" ]]; then
        echo "Warning: No RENDER_API_KEY+SERVICE_ID or deploy hook for ${service_name}. Skipping auto-deploy."
        return
    fi

    local hook_url="https://api.render.com/deploy/srv-${deploy_hook_key}"
    if [[ "${clear_cache}" == "true" ]]; then
        hook_url="${hook_url}?clearCache=true"
    fi
    curl -sf -X POST "${hook_url}"
    echo "Deploy triggered for ${service_name}"
}

health_check() {
    local url="$1"
    local max_retries=12
    local retry_delay=5

    echo "=== Health check: ${url} ==="
    for i in $(seq 1 ${max_retries}); do
        if curl -sf "${url}" > /dev/null 2>&1; then
            echo "Health check passed (attempt ${i})"
            return 0
        fi
        echo "Waiting for service... (attempt ${i}/${max_retries})"
        sleep "${retry_delay}"
    done

    echo "Health check FAILED after ${max_retries} attempts"
    return 1
}

# --- Main ---

load_env

case "${SERVICE}" in
    all)
        build_all
        echo ""
        echo "=== Starting services ==="
        docker_deploy "gateway"
        health_check "http://localhost:3003/health"
        docker_deploy "dashboard"
        health_check "http://localhost:3000/api/health"
        echo ""
        echo "=== Deployment complete ==="
        ;;
    gateway)
        build_gateway
        docker_deploy "gateway"
        health_check "http://localhost:3003/health"
        render_deploy "gateway"
        echo "Gateway deployed"
        ;;
    dashboard)
        build_dashboard
        docker_deploy "dashboard"
        health_check "http://localhost:3000/api/health"
        render_deploy "dashboard"
        echo "Dashboard deployed"
        ;;
    *)
        echo "Unknown service: ${SERVICE}"
        echo "Usage: ./deploy.sh [environment] [service]"
        echo "  environment: production|staging (default: production)"
        echo "  service: all|gateway|dashboard (default: all)"
        exit 1
        ;;
esac
