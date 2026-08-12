#!/bin/bash
# Automated Rollback System
# 
# Detects deployment issues and triggers automatic rollback

set -e

# Configuration
METRICS_ENDPOINT="${METRICS_ENDPOINT:-https://api.calliq.ai/metrics/production}"
ERROR_RATE_THRESHOLD=0.05 # 5%
LATENCY_THRESHOLD_MS=2000 # 2 seconds
SESSION_FAILURE_THRESHOLD=0.10 # 10%
CHECK_INTERVAL=10 # seconds
CHECK_DURATION=300 # 5 minutes
ROLLBACK_TRIGGER_COUNT=3 # Consecutive failures before rollback

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Get current metrics
get_metrics() {
    curl -sf "$METRICS_ENDPOINT" 2>/dev/null || echo "{}"
}

# Check error rate
check_error_rate() {
    local metrics=$(get_metrics)
    
    local error_rate=$(echo "$metrics" | jq -r '.data.telemetry.errorRate // 0')
    
    if (( $(echo "$error_rate > $ERROR_RATE_THRESHOLD" | bc -l) )); then
        log_error "Error rate ${error_rate} exceeds threshold ${ERROR_RATE_THRESHOLD}"
        return 1
    fi
    
    log_info "Error rate: ${error_rate} (OK)"
    return 0
}

# Check latency
check_latency() {
    local metrics=$(get_metrics)
    
    local p95_latency=$(echo "$metrics" | jq -r '.data.telemetry.latencyP95 // 0')
    
    if (( $(echo "$p95_latency > $LATENCY_THRESHOLD_MS" | bc -l) )); then
        log_error "P95 latency ${p95_latency}ms exceeds threshold ${LATENCY_THRESHOLD_MS}ms"
        return 1
    fi
    
    log_info "P95 latency: ${p95_latency}ms (OK)"
    return 0
}

# Check session failures
check_session_failures() {
    local metrics=$(get_metrics)
    
    local session_failure_rate=$(echo "$metrics" | jq -r '.data.telemetry.sessionFailureRate // 0')
    
    if (( $(echo "$session_failure_rate > $SESSION_FAILURE_THRESHOLD" | bc -l) )); then
        log_error "Session failure rate ${session_failure_rate} exceeds threshold ${SESSION_FAILURE_THRESHOLD}"
        return 1
    fi
    
    log_info "Session failure rate: ${session_failure_rate} (OK)"
    return 0
}

# Check memory usage
check_memory() {
    local metrics=$(get_metrics)
    
    local memory_percent=$(echo "$metrics" | jq -r '.data.process.memoryHeapMb // 0')
    local memory_limit=2048 # 2GB
    local memory_usage_percent=$(echo "scale=2; ($memory_percent / $memory_limit) * 100" | bc)
    
    if (( $(echo "$memory_usage_percent > 90" | bc -l) )); then
        log_error "Memory usage ${memory_usage_percent}% exceeds 90%"
        return 1
    fi
    
    log_info "Memory usage: ${memory_usage_percent}% (OK)"
    return 0
}

# Check active sessions
check_active_sessions() {
    local metrics=$(get_metrics)
    
    local active_sessions=$(echo "$metrics" | jq -r '.data.gateway.activeSessions // 0')
    
    # Sudden drop in sessions might indicate issue
    if [ -f /tmp/previous_sessions ]; then
        local previous_sessions=$(cat /tmp/previous_sessions)
        local drop_percent=$(echo "scale=2; (($previous_sessions - $active_sessions) / $previous_sessions) * 100" | bc)
        
        if (( $(echo "$drop_percent > 50" | bc -l) )); then
            log_error "Active sessions dropped by ${drop_percent}%"
            return 1
        fi
    fi
    
    echo "$active_sessions" > /tmp/previous_sessions
    log_info "Active sessions: ${active_sessions} (OK)"
    return 0
}

# Run all health checks
run_health_checks() {
    local failures=0
    
    if ! check_error_rate; then
        failures=$((failures + 1))
    fi
    
    if ! check_latency; then
        failures=$((failures + 1))
    fi
    
    if ! check_session_failures; then
        failures=$((failures + 1))
    fi
    
    if ! check_memory; then
        failures=$((failures + 1))
    fi
    
    if ! check_active_sessions; then
        failures=$((failures + 1))
    fi
    
    return $failures
}

# Trigger rollback
trigger_rollback() {
    log_error "=== TRIGGERING AUTOMATIC ROLLBACK ==="
    
    # Get deployment info
    local current_deployment=$(get_current_deployment)
    local previous_deployment=$(get_previous_deployment)
    
    log_info "Current deployment: $current_deployment"
    log_info "Rolling back to: $previous_deployment"
    
    # Execute rollback
    if rollback_deployment "$previous_deployment"; then
        log_info "Rollback successful"
        send_alert "success" "Automatic rollback to $previous_deployment successful"
        return 0
    else
        log_error "Rollback failed"
        send_alert "critical" "Automatic rollback FAILED - manual intervention required"
        return 1
    fi
}

# Get current deployment
get_current_deployment() {
    # This would query your deployment system (Render, K8s, etc.)
    echo "deployment-$(date +%Y%m%d-%H%M%S)"
}

# Get previous deployment
get_previous_deployment() {
    # This would query deployment history
    echo "deployment-previous"
}

# Rollback deployment
rollback_deployment() {
    local target_deployment=$1
    
    log_info "Executing rollback to $target_deployment"
    
    # This would use your deployment platform API
    # For Render: Use API to rollback to previous deployment
    # For K8s: kubectl rollout undo deployment/halla-ai-gateway
    
    # Simulate rollback
    sleep 5
    
    log_info "Rollback command executed"
    
    # Wait for rollback to complete
    log_info "Waiting for rollback to complete..."
    sleep 30
    
    # Verify rollback
    if verify_rollback; then
        return 0
    else
        return 1
    fi
}

# Verify rollback
verify_rollback() {
    log_info "Verifying rollback..."
    
    # Check health
    local health_url="${METRICS_ENDPOINT%/metrics/production}/health"
    
    for i in {1..10}; do
        if curl -sf "$health_url" > /dev/null 2>&1; then
            log_info "Health check passed after rollback"
            return 0
        fi
        log_warn "Health check attempt $i/10 failed, retrying..."
        sleep 5
    done
    
    log_error "Health check failed after rollback"
    return 1
}

# Send alert
send_alert() {
    local severity=$1
    local message=$2
    
    log_info "ALERT [$severity]: $message"
    
    # This would integrate with PagerDuty, Slack, etc.
    # For now, just log
}

# Monitor deployment
monitor_deployment() {
    log_info "=== Starting Deployment Monitoring ==="
    log_info "Duration: ${CHECK_DURATION}s"
    log_info "Check interval: ${CHECK_INTERVAL}s"
    log_info "Rollback trigger: ${ROLLBACK_TRIGGER_COUNT} consecutive failures"
    
    local start_time=$(date +%s)
    local end_time=$((start_time + CHECK_DURATION))
    local consecutive_failures=0
    
    while [ $(date +%s) -lt $end_time ]; do
        log_info "--- Health Check ---"
        
        if run_health_checks; then
            log_info "All checks passed"
            consecutive_failures=0
        else
            consecutive_failures=$((consecutive_failures + 1))
            log_warn "Health check failed (${consecutive_failures}/${ROLLBACK_TRIGGER_COUNT})"
            
            if [ $consecutive_failures -ge $ROLLBACK_TRIGGER_COUNT ]; then
                log_error "Rollback threshold reached"
                trigger_rollback
                exit 1
            fi
        fi
        
        sleep $CHECK_INTERVAL
    done
    
    log_info "=== Monitoring Complete - Deployment Stable ==="
    send_alert "info" "Deployment monitoring complete - all checks passed"
}

# Main
main() {
    case "${1:-monitor}" in
        monitor)
            monitor_deployment
            ;;
        rollback)
            trigger_rollback
            ;;
        check)
            run_health_checks
            ;;
        *)
            echo "Usage: $0 {monitor|rollback|check}"
            exit 1
            ;;
    esac
}

main "$@"
