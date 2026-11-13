import { dataSuite } from '../../fixtures/data';
import { infra } from '../../fixtures/infra';

export default dataSuite('mongodb', { type: 'mongodb', ...infra.mongodb, logging: false });
