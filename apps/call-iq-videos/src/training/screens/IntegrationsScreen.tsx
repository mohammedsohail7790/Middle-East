import { IntegrationGrid, type Integration } from "../IntegrationGrid";

type IntegrationsScreenProps = {
  integrations: Integration[];
};

export const IntegrationsScreen: React.FC<IntegrationsScreenProps> = ({
  integrations,
}) => <IntegrationGrid integrations={integrations} />;
