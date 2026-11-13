import { AggregateRoot, DomainEvent, Identifier, ValueObject } from '@axisparkjs/ddd';
import { defineSuite } from '../../runner/define-suite';

class CustomerId extends Identifier<string> {
    protected validate(value: string): void {
        if (value.trim().length === 0) throw new Error('Customer ID cannot be empty');
    }
}

class EmailAddress extends ValueObject<string> {
    protected validate(value: string): void {
        if (!value.includes('@')) throw new Error('Email address must contain @');
    }

    public toString(): string {
        return this.value;
    }
}

class CustomerRegistered extends DomainEvent {
    constructor(readonly customerId: string) {
        super();
    }
}

class Customer extends AggregateRoot<CustomerId> {
    constructor(
        id: CustomerId,
        public email: EmailAddress
    ) {
        super(id);
    }

    static register(id: string, email: string): Customer {
        const customer = new Customer(new CustomerId(id), new EmailAddress(email));
        customer.addDomainEvent(new CustomerRegistered(id));
        return customer;
    }
}

/** The same data as a plain object, validated by hand. */
function plainCustomer(id: string, email: string) {
    if (id.trim().length === 0) throw new Error('Customer ID cannot be empty');
    if (!email.includes('@')) throw new Error('Email address must contain @');
    return { id, email, events: [{ type: 'CustomerRegistered', customerId: id, occurredOn: new Date() }] };
}

const a = new EmailAddress('ada@example.com');
const b = new EmailAddress('ada@example.com');

export default defineSuite({
    package: '@axisparkjs/ddd',
    id: 'ddd.domain',
    version: 1,
    tier: 'micro',
    description: 'Creates aggregates with value objects and records domain events.',
    baseline: { 'aggregate-with-event': 'raw-object' },
    tasks: {
        'value-object': () => new EmailAddress('ada@example.com'),
        'value-equals': () => a.equals(b),
        'aggregate-with-event': () => Customer.register('c-1', 'ada@example.com').pullDomainEvents(),
        'raw-object': () => plainCustomer('c-1', 'ada@example.com').events
    }
});
