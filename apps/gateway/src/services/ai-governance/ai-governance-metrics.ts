export const aiGovernanceMetrics = {
  executions: 0,
  denials: 0,
  guardrailTriggers: 0,
  policyViolations: 0,
  duplicatePreventions: 0,
  failures: 0,
  totalLatencyMs: 0,
  byTool: new Map<string, number>(),
  byTenant: new Map<string, number>(),
};

export function recordExecution(toolName: string, tenantId: string, latencyMs: number): void {
  aiGovernanceMetrics.executions++;
  aiGovernanceMetrics.totalLatencyMs += latencyMs;
  aiGovernanceMetrics.byTool.set(toolName, (aiGovernanceMetrics.byTool.get(toolName) || 0) + 1);
  aiGovernanceMetrics.byTenant.set(tenantId, (aiGovernanceMetrics.byTenant.get(tenantId) || 0) + 1);
}

export function snapshotMetrics() {
  return {
    executions: aiGovernanceMetrics.executions,
    denials: aiGovernanceMetrics.denials,
    guardrailTriggers: aiGovernanceMetrics.guardrailTriggers,
    policyViolations: aiGovernanceMetrics.policyViolations,
    duplicatePreventions: aiGovernanceMetrics.duplicatePreventions,
    failures: aiGovernanceMetrics.failures,
    avgLatencyMs:
      aiGovernanceMetrics.executions > 0
        ? Math.round(aiGovernanceMetrics.totalLatencyMs / aiGovernanceMetrics.executions)
        : 0,
    topTools: [...aiGovernanceMetrics.byTool.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tool, count]) => ({ tool, count })),
    tenantActivity: [...aiGovernanceMetrics.byTenant.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tenantId, count]) => ({ tenantId, count })),
  };
}
