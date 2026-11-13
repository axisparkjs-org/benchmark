import { dataSuite } from '../../fixtures/data';
import { infra } from '../../fixtures/infra';

export default dataSuite('mysql', { type: 'mysql', ...infra.mysql, logging: false });
