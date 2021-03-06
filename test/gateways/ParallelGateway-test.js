'use strict';

const Code = require('code');
const EventEmitter = require('events').EventEmitter;
const factory = require('../helpers/factory');
const Lab = require('lab');
const testHelpers = require('../helpers/testHelpers');

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const Bpmn = require('../..');

lab.experiment('ParallelGateway', () => {
  lab.describe('join', () => {
    const processXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <parallelGateway id="fork" />
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fork" />
    <sequenceFlow id="flow2" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow3" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow4" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

    let context;
    lab.beforeEach((done) => {
      testHelpers.getContext(processXml, (err, c) => {
        if (err) return done(err);
        context = c;
        done();
      });
    });

    lab.test('should have pending inbound when ran', (done) => {
      const gateway = context.getChildActivityById('join');
      gateway.activate();
      gateway.run();
      expect(gateway.pendingInbound).to.have.length(2);
      expect(gateway.pendingJoin).to.be.true();
      done();
    });

    lab.test('emits start when first inbound is taken', (done) => {
      const gateway = context.getChildActivityById('join');
      gateway.activate();
      gateway.run();
      expect(gateway.pendingInbound).to.have.length(2);
      expect(gateway.taken).to.not.be.true();

      gateway.on('start', () => {
        expect(gateway.taken).to.be.true();
        expect(gateway.pendingInbound).to.have.length(1);
        done();
      });

      gateway.pendingInbound[0].take();
    });

    lab.test('emits end when all inbounds are taken', (done) => {
      const gateway = context.getChildActivityById('join');
      gateway.activate();
      gateway.run();
      expect(gateway.pendingInbound).to.have.length(2);

      gateway.on('end', () => {
        expect(gateway.pendingInbound).to.not.exist();
        done();
      });

      gateway.inbound.forEach((f) => f.take());
    });

    lab.test('discards outbound if inbound was discarded', (done) => {
      const gateway = context.getChildActivityById('join');

      const discardedFlows = [];
      gateway.outbound.forEach((f) => {
        f.once('discarded', () => {
          discardedFlows.push(f.id);
        });
      });

      gateway.on('leave', () => {
        expect(discardedFlows).to.equal(['flow4']);
        done();
      });

      gateway.activate();
      gateway.inbound.forEach((f) => f.discard());
    });

    lab.describe('getState()', () => {
      lab.test('on start returns pendingInbound', (done) => {
        const gateway = context.getChildActivityById('join');
        gateway.activate();
        gateway.run();

        gateway.once('start', () => {
          const state = gateway.getState();
          expect(state).to.include({
            pendingInbound: ['flow3']
          });
          done();
        });

        gateway.inbound[0].take();
      });

      lab.test('discarded inbound is returned in discardedInbound', (done) => {
        const gateway = context.getChildActivityById('join');
        gateway.activate();
        gateway.run();

        gateway.once('start', () => {
          const state = gateway.getState();
          expect(state).to.include({
            pendingInbound: ['flow3'],
            discardedInbound: ['flow2']
          });
          done();
        });

        gateway.inbound[0].discard();
      });
    });

    lab.describe('resume()', () => {

      lab.test('sets resumed gateway pendingInbound', (done) => {
        const gateway = context.getChildActivityById('join');

        gateway.on('start', () => {
          const state = gateway.getState();

          expect(state).to.include({
            pendingInbound: ['flow3']
          });

          const clonedContext = testHelpers.cloneContext(context);
          const resumedGateway = clonedContext.getChildActivityById('join');
          resumedGateway.resume(state);
          expect(resumedGateway.pendingInbound).to.have.length(1);

          done();
        });

        gateway.activate();
        gateway.run();
        gateway.pendingInbound[0].take();
      });

      lab.test('completes when pending inbound flows are taken', (done) => {
        const gateway = context.getChildActivityById('join');

        gateway.on('start', () => {
          const state = gateway.getState();

          expect(state).to.include({
            pendingInbound: ['flow3']
          });

          const clonedContext = testHelpers.cloneContext(context);
          const resumedGateway = clonedContext.getChildActivityById('join');

          resumedGateway.id += '-resumed';

          resumedGateway.once('end', () => {
            done();
          });

          resumedGateway.activate();
          resumedGateway.resume(state);
          resumedGateway.pendingInbound[0].take();
        });

        gateway.activate();
        gateway.run();
        gateway.inbound[0].take();
      });

      lab.test('completes if one inbound flow is discarded', (done) => {
        const gateway = context.getChildActivityById('join');

        gateway.on('start', () => {
          const state = gateway.getState();

          expect(state).to.include({
            pendingInbound: ['flow3']
          });

          const clonedContext = testHelpers.cloneContext(context);
          const resumedGateway = clonedContext.getChildActivityById('join');

          resumedGateway.id += '-resumed';

          resumedGateway.once('end', () => {
            done();
          });

          resumedGateway.activate();
          resumedGateway.resume(state);
          resumedGateway.pendingInbound[0].take();
        });

        gateway.activate();
        gateway.run();
        gateway.inbound[0].discard();
      });

      lab.test('discards outbound if all inbound was discarded', (done) => {
        const gateway = context.getChildActivityById('join');

        gateway.on('start', () => {
          const state = gateway.getState();

          expect(state).to.include({
            pendingInbound: ['flow3']
          });

          const clonedContext = testHelpers.cloneContext(context);
          const resumedGateway = clonedContext.getChildActivityById('join');

          resumedGateway.id += '-resumed';

          resumedGateway.outbound[0].once('discarded', () => {
            done();
          });
          resumedGateway.outbound[0].once('taken', () => {
            Code.fail('Should not be taken');
          });

          resumedGateway.activate();
          resumedGateway.resume(state);
          resumedGateway.pendingInbound[0].discard();
        });

        gateway.activate();
        gateway.run();
        gateway.inbound[0].discard();
      });
    });
  });

  lab.describe('fork', () => {
    const processXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <parallelGateway id="fork" />
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fork" />
    <sequenceFlow id="flow2" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow3" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow4" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

    let context;
    lab.beforeEach((done) => {
      testHelpers.getContext(processXml, (err, c) => {
        if (err) return done(err);
        context = c;
        done();
      });
    });

    lab.test('should have pending outbound when ran', (done) => {
      const gateway = context.getChildActivityById('fork');
      gateway.run();
      expect(gateway.pendingOutbound).to.have.length(2);
      done();
    });

    lab.test('emits start when first outbound is taken', (done) => {
      const gateway = context.getChildActivityById('fork');

      gateway.on('start', () => {
        expect(gateway.pendingOutbound).to.have.length(1);
        done();
      });

      gateway.activate();
      gateway.run();
    });

    lab.test('emits end when all outbounds are taken', (done) => {
      const gateway = context.getChildActivityById('fork');

      gateway.on('end', () => {
        expect(gateway.pendingOutbound).to.not.exist();
        done();
      });

      gateway.activate();
      gateway.run();
    });

    lab.test('discards all outbound if inbound was discarded', (done) => {
      const gateway = context.getChildActivityById('fork');

      const discardedFlows = [];
      gateway.outbound.forEach((f) => {
        f.once('discarded', () => {
          discardedFlows.push(f.id);
        });
      });

      gateway.on('leave', () => {
        expect(discardedFlows, 'discarded flows').to.equal(['flow2', 'flow3']);
        done();
      });

      gateway.activate();
      gateway.inbound.forEach((f) => f.discard());
    });

    lab.describe('getState()', () => {

      lab.test('on start returns pendingOutbound', (done) => {
        const gateway = context.getChildActivityById('fork');

        gateway.on('start', () => {
          const state = gateway.getState();
          expect(state).to.include({
            pendingOutbound: ['flow3']
          });
          done();
        });

        gateway.activate();
        gateway.run();
      });
    });

    lab.test('start with fork emits start', (done) => {
      const startProcessXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <parallelGateway id="fork" />
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow2" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow3" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

      testHelpers.getContext(startProcessXml, (err, ctx) => {
        if (err) return done(err);
        const gateway = ctx.getChildActivityById('fork');

        gateway.on('start', () => {
          done();
        });

        gateway.activate();
        gateway.run();
      });
    });

    lab.describe('resume()', () => {

      lab.test('sets gateway pendingOutbound', (done) => {
        const gateway = context.getChildActivityById('fork');

        gateway.on('start', () => {
          const state = gateway.getState();

          expect(state).to.include({
            pendingOutbound: ['flow3']
          });

          const clonedContext = testHelpers.cloneContext(context);
          const resumedGateway = clonedContext.getChildActivityById('fork');
          resumedGateway.resume(state);
          expect(resumedGateway.pendingOutbound).to.have.length(1);

          done();
        });

        gateway.activate();
        gateway.run();
      });

      lab.test('starts taking pending outbound flows', (done) => {
        const gateway = context.getChildActivityById('fork');

        gateway.on('start', () => {
          const state = gateway.getState();

          expect(state).to.include({
            pendingOutbound: ['flow3']
          });

          const clonedContext = testHelpers.cloneContext(context);
          const resumedGateway = clonedContext.getChildActivityById('fork');

          const takenFlows = [];
          resumedGateway.outbound.forEach((flow) => {
            flow.once('taken', (f) => takenFlows.push(f.id));
          });

          resumedGateway.id += '-resumed';

          resumedGateway.once('end', () => {
            expect(takenFlows).to.equal(['flow3']);
            done();
          });

          resumedGateway.activate();
          resumedGateway.resume(state);
        });

        gateway.activate();
        gateway.run();
      });
    });
  });

  lab.describe('engine', () => {
    lab.test('should join diverging fork', (done) => {
      const definitionXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theJoinDivergingForkProcess" isExecutable="true">
    <startEvent id="theStart" />
    <parallelGateway id="fork" />
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fork" />
    <sequenceFlow id="flow2" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow3" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow4" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow5" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

      const engine = new Bpmn.Engine({
        source: definitionXml
      });
      engine.execute((err, definition) => {
        if (err) return done(err);

        definition.on('end', () => {
          expect(definition.getChildActivityById('end').taken, 'end').to.be.true();
          testHelpers.expectNoLingeringListenersOnDefinition(definition);
          done();
        });
      });
    });

    lab.test('should fork multiple diverging flows', (done) => {
      const definitionXml = `
  <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess" isExecutable="true">
      <startEvent id="theStart" />
      <parallelGateway id="fork" />
      <endEvent id="end1" />
      <endEvent id="end2" />
      <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fork" />
      <sequenceFlow id="flow2" sourceRef="fork" targetRef="end1" />
      <sequenceFlow id="flow3" sourceRef="fork" targetRef="end2" />
    </process>
  </definitions>`;

      const engine = new Bpmn.Engine({
        source: definitionXml
      });
      engine.execute((err, definition) => {
        if (err) return done(err);

        definition.on('end', () => {
          expect(definition.getChildActivityById('end1').taken, 'end1').to.be.true();
          expect(definition.getChildActivityById('end2').taken, 'end2').to.be.true();
          done();
        });
      });
    });

    lab.test('should join even if discarded flow', (done) => {
      const definitionXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <inclusiveGateway id="decision" default="flow4" />
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
    <sequenceFlow id="flow2" sourceRef="decision" targetRef="join" />
    <sequenceFlow id="flow3" sourceRef="decision" targetRef="join" />
    <sequenceFlow id="flow4" sourceRef="decision" targetRef="join" />
    <sequenceFlow id="flow5" sourceRef="decision" targetRef="join">
      <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
      this.variables.input <= 50
      ]]></conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

      const engine = new Bpmn.Engine({
        source: definitionXml
      });
      engine.execute({
        variables: {
          input: 51
        }
      }, (err, definition) => {
        if (err) return done(err);

        definition.on('end', () => {
          expect(definition.getChildActivityById('end').taken, 'end').to.be.true();
          testHelpers.expectNoLingeringListenersOnDefinition(definition);
          done();
        });
      });
    });

    lab.test('should join discarded flow with tasks', (done) => {
      const definitionXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <inclusiveGateway id="decisions" />
    <scriptTask id="script" scriptFormat="Javascript">
      <script>next();</script>
    </scriptTask>
    <userTask id="task" />
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decisions" />
    <sequenceFlow id="flow2" sourceRef="decisions" targetRef="script" />
    <sequenceFlow id="flow3" sourceRef="script" targetRef="join" />
    <sequenceFlow id="flow4" sourceRef="decisions" targetRef="task">
      <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
        this.variables.input <= 50
      ]]></conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow5" sourceRef="task" targetRef="join" />
    <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

      const engine = new Bpmn.Engine({
        source: definitionXml
      });
      engine.once('end', (def) => {
        expect(def.getChildActivityById('end').taken, 'end').to.be.true();
        expect(def.getChildActivityById('task').taken, 'task').to.not.be.true();
        testHelpers.expectNoLingeringListenersOnDefinition(def);
        done();
      });
      engine.execute({
        variables: {
          input: 51
        }
      });
    });

    lab.test('regardless of flow order', (done) => {
      const definitionXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <inclusiveGateway id="decision" />
    <userTask id="task" />
    <scriptTask id="script" scriptFormat="Javascript">
      <script>next();</script>
    </scriptTask>
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
    <sequenceFlow id="flow2" sourceRef="decision" targetRef="task">
      <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
        this.variables.input <= 50
      ]]></conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow3" sourceRef="task" targetRef="join" />
    <sequenceFlow id="flow4" sourceRef="decision" targetRef="script" />
    <sequenceFlow id="flow5" sourceRef="script" targetRef="join" />
    <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

      const engine = new Bpmn.Engine({
        source: definitionXml
      });
      engine.execute({
        variables: {
          input: 51
        }
      }, (err, definition) => {
        if (err) return done(err);

        definition.on('end', () => {
          expect(definition.getChildActivityById('end').taken, 'end').to.be.true();
          testHelpers.expectNoLingeringListenersOnDefinition(definition);
          done();
        });
      });
    });

    lab.test('and with default', (done) => {
      const definitionXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <inclusiveGateway id="decision" default="flow4" />
    <userTask id="task" />
    <scriptTask id="script" scriptFormat="Javascript">
      <script>next();</script>
    </scriptTask>
    <parallelGateway id="join" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="decision" />
    <sequenceFlow id="flow2" sourceRef="decision" targetRef="script">
      <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
        this.variables.input <= 50
      ]]></conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow3" sourceRef="script" targetRef="join" />
    <sequenceFlow id="flow4" sourceRef="decision" targetRef="task" />
    <sequenceFlow id="flow5" sourceRef="task" targetRef="join" />
    <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
  </process>
</definitions>`;

      const engine = new Bpmn.Engine({
        source: definitionXml
      });
      engine.execute({
        variables: {
          input: 50
        }
      }, (err, definition) => {
        if (err) return done(err);

        definition.on('end', () => {
          expect(definition.getChildActivityById('end').taken, 'end').to.be.true();
          testHelpers.expectNoLingeringListenersOnDefinition(definition);
          done();
        });
      });
    });

    lab.test('completes process with multiple joins in discarded path', (done) => {
      const definitionXml = factory.resource('multiple-joins.bpmn');
      const engine = new Bpmn.Engine({
        source: definitionXml
      });

      engine.execute({
        variables: {
          input: 51
        }
      }, (err, definition) => {
        if (err) return done(err);

        definition.on('end', () => {
          expect(definition.getChildActivityById('scriptTask1').taken, 'scriptTask1').to.be.true();
          expect(definition.getChildActivityById('scriptTask2').taken, 'scriptTask2').to.be.true();
          testHelpers.expectNoLingeringListenersOnDefinition(definition);
          done();
        });
      });
    });

    lab.test('completes process with ending join', (done) => {
      const definitionXml = `
<?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <parallelGateway id="fork" />
    <parallelGateway id="join" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fork" />
    <sequenceFlow id="flow2" sourceRef="fork" targetRef="join" />
    <sequenceFlow id="flow3" sourceRef="fork" targetRef="join" />
  </process>
</definitions>`;

      const engine = new Bpmn.Engine({
        source: definitionXml
      });

      engine.once('end', () => {
        done();
      });

      engine.execute();
    });

    lab.test('completes process with succeeding joins', (done) => {
      const engine = new Bpmn.Engine({
        source: factory.resource('succeeding-joins.bpmn'),
        moddleOptions: {
          camunda: require('camunda-bpmn-moddle/resources/camunda')
        }
      });

      const listener = new EventEmitter();
      listener.on('start', (activity, inst) => {
        if (activity.type !== 'bpmn:Process') {
          expect(inst.getState().children.filter(c => c.entered).length, `start ${activity.id}`).to.be.above(0);
        }
      });

      engine.once('end', () => {
        done();
      });

      engine.execute({
        listener: listener
      });
    });

    lab.describe('resume()', () => {
      lab.test('should continue join', (done) => {
        const definitionXml = `
  <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess" isExecutable="true">
      <startEvent id="theStart" />
      <parallelGateway id="fork" />
      <userTask id="task1" />
      <userTask id="task2" />
      <parallelGateway id="join" />
      <endEvent id="end" />
      <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fork" />
      <sequenceFlow id="flow2" sourceRef="fork" targetRef="task1" />
      <sequenceFlow id="flow3" sourceRef="fork" targetRef="task2" />
      <sequenceFlow id="flow4" sourceRef="task1" targetRef="join" />
      <sequenceFlow id="flow5" sourceRef="task2" targetRef="join" />
      <sequenceFlow id="flow6" sourceRef="join" targetRef="end" />
    </process>
  </definitions>`;

        let state;
        const engine = new Bpmn.Engine({
          source: definitionXml
        });
        const listener = new EventEmitter();
        listener.once('wait-task1', (task) => {
          task.signal();
        });

        listener.once('start-join', () => {
          state = engine.getState();
          engine.stop();
        });

        engine.once('end', () => {
          const listener2 = new EventEmitter();
          listener2.once('wait-task2', (task) => {
            task.signal();
          });
          const engine2 = Bpmn.Engine.resume(state, {
            listener: listener2
          });
          engine2.once('end', () => {
            done();
          });
        });

        engine.execute({
          listener: listener
        });

      });
    });
  });
});
