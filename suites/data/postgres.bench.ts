import { dataSuite } from '../../fixtures/data';
import { infra } from '../../fixtures/infra';

export default dataSuite('postgres', { type: 'postgres', ...infra.postgres, logging: false });
