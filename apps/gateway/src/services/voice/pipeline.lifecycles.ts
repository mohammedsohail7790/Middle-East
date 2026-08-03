import { logger } from '../logger.js';
import { Ownership, PipelineRevisions } from './conversation.orchestrator.js';

// Pipeline interface for stale propagation
interface PipelineLifecycle {
  pipelineId: string;
  ownership: Ownership;
  isActive: boolean;
  abortController?: AbortController;
}

// Stale propagation manager for orchestrator
export class PipelineLifecycleManager {
  private activePipelines = new Map<string, PipelineLifecycle>();
  
  // Register active pipeline with ownership
  registerPipeline(
    pipelineId: string,
    ownership: Ownership,
    abortController?: AbortController
  ): void {
    const pipeline: PipelineLifecycle = {
      pipelineId,
      ownership,
      isActive: true,
      abortController
    };
    
    this.activePipelines.set(pipelineId, pipeline);
    
    logger.info('PIPELINE_REGISTERED', {
      pipelineId,
      turnId: ownership.turnId,
      responseId: ownership.responseId,
      conversationRevision: ownership.revisions.conversationRevision,
      turnRevision: ownership.revisions.turnRevision
    });
  }
  
  // Mark pipeline as completed
  completePipeline(pipelineId: string): void {
    const pipeline = this.activePipelines.get(pipelineId);
    if (!pipeline) return;
    
    pipeline.isActive = false;
    this.activePipelines.delete(pipelineId);
    
    logger.info('PIPELINE_COMPLETED', {
      pipelineId,
      turnId: pipeline.ownership.turnId,
      timestamp: Date.now()
    });
  }
  
  // Propagate staleness to all pipelines for a turn
  propagateStale(
    turnId: string,
    reason: string,
    expectedRevisions?: PipelineRevisions
  ): void {
    let staleCount = 0;
    
    for (const [pipelineId, pipeline] of this.activePipelines) {
      // Verify turn ownership
      if (pipeline.ownership.turnId !== turnId) continue;
      
      // Verify revisions if provided
      if (expectedRevisions) {
        const revisionsMatch = 
          pipeline.ownership.revisions.conversationRevision === expectedRevisions.conversationRevision &&
          pipeline.ownership.revisions.turnRevision === expectedRevisions.turnRevision;
        
        if (!revisionsMatch) {
          logger.debug('PIPELINE_STALE_SKIPPED_REVISION_MISMATCH', {
            pipelineId,
            turnId,
            expected: expectedRevisions,
            actual: pipeline.ownership.revisions
          });
          continue;
        }
      }
      
      // Mark as stale and abort
      pipeline.isActive = false;
      pipeline.abortController?.abort();
      
      staleCount++;
      
      logger.info('PIPELINE_MARKED_STALE', {
        pipelineId,
        turnId,
        responseId: pipeline.ownership.responseId,
        reason,
        conversationRevision: pipeline.ownership.revisions.conversationRevision,
        turnRevision: pipeline.ownership.revisions.turnRevision,
        timestamp: Date.now()
      });
    }
    
    // Remove stale pipelines
    for (const [pipelineId, pipeline] of this.activePipelines) {
      if (!pipeline.isActive) {
        this.activePipelines.delete(pipelineId);
      }
    }
    
    logger.info('STALE_PROPAGATION_COMPLETED', {
      turnId,
      reason,
      staleCount,
      remainingActive: this.activePipelines.size,
      timestamp: Date.now()
    });
  }
  
  // Propagate staleness to all pipelines (conversation-level)
  propagateStaleAll(reason: string): void {
    let staleCount = 0;
    
    for (const [pipelineId, pipeline] of this.activePipelines) {
      pipeline.isActive = false;
      pipeline.abortController?.abort();
      staleCount++;
      
      logger.info('PIPELINE_MARKED_STALE_ALL', {
        pipelineId,
        turnId: pipeline.ownership.turnId,
        responseId: pipeline.ownership.responseId,
        reason,
        timestamp: Date.now()
      });
    }
    
    // Clear all pipelines
    this.activePipelines.clear();
    
    logger.info('STALE_PROPAGATION_ALL_COMPLETED', {
      reason,
      staleCount,
      timestamp: Date.now()
    });
  }
  
  // Get active pipelines for monitoring
  getActivePipelines(): Array<{
    pipelineId: string;
    turnId: string;
    responseId: string;
    isActive: boolean;
  }> {
    return Array.from(this.activePipelines.values()).map(pipeline => ({
      pipelineId: pipeline.pipelineId,
      turnId: pipeline.ownership.turnId,
      responseId: pipeline.ownership.responseId,
      isActive: pipeline.isActive
    }));
  }
  
  // Check if pipeline is still active
  isPipelineActive(pipelineId: string): boolean {
    const pipeline = this.activePipelines.get(pipelineId);
    return pipeline?.isActive || false;
  }
  
  // Get pipeline ownership
  getPipelineOwnership(pipelineId: string): Ownership | null {
    const pipeline = this.activePipelines.get(pipelineId);
    return pipeline?.ownership || null;
  }
  
  // Cleanup
  cleanup(): void {
    this.propagateStaleAll('lifecycle_manager_cleanup');
  }
}
