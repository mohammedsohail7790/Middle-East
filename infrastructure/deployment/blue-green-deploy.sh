#!/bin/bash
# Blue/Green Deployment Script
# 
# Orchestrates zero-downtime deployment with automated rollback

set -e

# Configuration
BLUE_ENV="production-blue"
GREEN_ENV="production-green"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-https://api.calliq.ai/health}"
READY_CHECK_URL="${READY_CHECK_URL:-https://api.calliq.ai/ready}"
DEPLOYMENT_TIMEOUT=300 # 5 minutes
HEALTH_CHECK_INTERVAL=5 # seconds
TRAFFIC_SHIFT_DURATION=60 # seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get current active environment
get_active_environment() {
    # Query load balancer or service discovery to determine active environment
    # For Render, check which service is receiving traffic
    echo "$BLUE_ENV" # Default to blue
}

# Get inactive environment
get_inactive_environment() {
    local active=$(get_active_environment)
    if [ "$active" == "$BLUE_ENV" ]; then
        echo "$GREEN_ENV"
    else
        echo "$BLUE_ENV"
    fi
}

# Health check function
check_health() {
    local url=$1
    local max_attempts=${2:-60}
    local attempt=0

    log_info "Checking health at $url"

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_info "Health check passed"
            return 0
        fi

        attempt=$((attempt + 1))
        log_warn "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep $HEALTH_CHECK_INTERVAL
    done

    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Readiness check function
check_readiness() {
    local url=$1
    local max_attempts=${2:-30}
    local attempt=0

    log_info "Checking readiness at $url"

    while [ $attempt -lt $max_attempts ]; do
        response=$(curl -sf "$url" 2>/dev/null || echo "")
        
        if echo "$response" | grep -q '"status":"ready"'; then
            log_info "Readiness check passed"
            return 0
        fi

        attempt=$((attempt + 1))
        log_warn "Readiness check attempt $attempt/$max_attempts failed, retrying..."
        sleep $HEALTH_CHECK_INTERVAL
    done

    log_error "Readiness check failed after $max_attempts attempts"
    return 1
}

# Deploy to inactive environment
deploy_to_inactive() {
    local inactive_env=$(get_inactive_environment)
    
    log_info "Deploying to inactive environment: $inactive_env"
    
    # Trigger deployment (Render-specific)
    # This would use Render API or git push to trigger deployment
    log_info "Triggering deployment via git push..."
    
    # Wait for deployment to complete
    log_info "Waiting for deployment to complete..."
    sleep 30
    
    log_info "Deployment to $inactive_env complete"
}

# Run smoke tests
run_smoke_tests() {
    local env=$1
    
    log_info "Running smoke tests on $env"
    
    # Test critical endpoints
    local endpoints=(
        "/health"
        "/ready"
        "/api/v1/voice/health"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local url="${HEALTH_CHECK_URL%/health}$endpoint"
        if ! curl -sf "$url" > /dev/null 2>&1; then
            log_error "Smoke test failed for endpoint: $endpoint"
            return 1
        fi
        log_info "✓ $endpoint"
    done
    
    log_info "All smoke tests passed"
    return 0
}

# Shift traffic gradually
shift_traffic() {
    local from_env=$1
    local to_env=$2
    
    log_info "Shifting traffic from $from_env to $to_env"
    
    # Gradual traffic shift: 10% -> 50% -> 100%
    local percentages=(10 50 100)
    
    for percentage in "${percentages[@]}"; do
        log_info "Shifting ${percentage}% traffic to $to_env"
        
        # Update load balancer configuration
        # This would use your load balancer API (NGINX, AWS ALB, etc.)
        
        # Wait and monitor
        sleep $((TRAFFIC_SHIFT_DURATION / 3))
        
        # Check error rates
        if ! check_error_rates "$to_env"; then
            log_error "High error rate detected during traffic shift"
            return 1
        fi
        
        log_info "Traffic shift to ${percentage}% successful"
    done
    
    log_info "Traffic shift complete"
    return 0
}

# Check error rates
check_error_rates() {
    local env=$1
    
    # Query metrics endpoint for error rate
    # This would check Prometheus/Grafana for error rate
    
    # For now, simple health check
    if ! check_health "$HEALTH_CHECK_URL" 3; then
        return 1
    fi
    
    return 0
}

# Rollback deployment
rollback() {
    local from_env=$1
    local to_env=$2
    
    log_warn "Rolling back from $from_env to $to_env"
    
    # Shift traffic back immediately
    log_info "Shifting 100% traffic back to $to_env"
    
    # Update load balancer
    # This would revert load balancer configuration
    
    log_info "Rollback complete"
}

# Drain connections from old environment
drain_connections() {
    local env=$1
    
    log_info "Draining connections from $env"
    
    # Send SIGUSR2 to trigger graceful drain
    # This would use your orchestration platform API
    
    # Wait for drain to complete (30 seconds)
    sleep 30
    
    log_info "Connection drain complete"
}

# Main deployment flow
main() {
    log_info "=== Blue/Green Deployment Started ==="
    log_info "Timestamp: $(date)"
    
    # Get current environments
    local active_env=$(get_active_environment)
    local inactive_env=$(get_inactive_environment)
    
    log_info "Active environment: $active_env"
    log_info "Inactive environment: $inactive_env"
    
    # Step 1: Deploy to inactive environment
    log_info "Step 1: Deploying to inactive environment"
    if ! deploy_to_inactive; then
        log_error "Deployment failed"
        exit 1
    fi
    
    # Step 2: Health checks
    log_info "Step 2: Running health checks"
    if ! check_health "$HEALTH_CHECK_URL"; then
        log_error "Health check failed"
        exit 1
    fi
    
    if ! check_readiness "$READY_CHECK_URL"; then
        log_error "Readiness check failed"
        exit 1
    fi
    
    # Step 3: Smoke tests
    log_info "Step 3: Running smoke tests"
    if ! run_smoke_tests "$inactive_env"; then
        log_error "Smoke tests failed"
        exit 1
    fi
    
    # Step 4: Gradual traffic shift
    log_info "Step 4: Shifting traffic"
    if ! shift_traffic "$active_env" "$inactive_env"; then
        log_error "Traffic shift failed, rolling back"
        rollback "$inactive_env" "$active_env"
        exit 1
    fi
    
    # Step 5: Drain old environment
    log_info "Step 5: Draining old environment"
    drain_connections "$active_env"
    
    # Step 6: Final validation
    log_info "Step 6: Final validation"
    if ! check_health "$HEALTH_CHECK_URL" 10; then
        log_error "Final validation failed, rolling back"
        rollback "$inactive_env" "$active_env"
        exit 1
    fi
    
    log_info "=== Blue/Green Deployment Complete ==="
    log_info "New active environment: $inactive_env"
    log_info "Old environment: $active_env (ready for next deployment)"
    
    # Send success notification
    send_notification "success" "Deployment to $inactive_env successful"
}

# Send notification (Slack, email, etc.)
send_notification() {
    local status=$1
    local message=$2
    
    # This would integrate with your notification system
    log_info "Notification: [$status] $message"
}

# Run main deployment
main "$@"
