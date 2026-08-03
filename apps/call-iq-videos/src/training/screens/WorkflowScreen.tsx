import { WorkflowCanvas, type WorkflowNode } from "../WorkflowCanvas";

type WorkflowScreenProps = {
  nodes: WorkflowNode[];
  activeIndex?: number;
};

export const WorkflowScreen: React.FC<WorkflowScreenProps> = ({
  nodes,
  activeIndex,
}) => <WorkflowCanvas nodes={nodes} activeIndex={activeIndex} />;
