/**
 * ECS World — lightweight Entity-Component-System container.
 *
 * Entity: unique ID + map of Component instances.
 * Component: plain data object with a type tag.
 * System: function that processes matching entities each frame.
 *
 * Usage:
 *   world.component('Position', { x: 0, y: 0 });
 *   const e = world.entity().set('Position', { x: 10, y: 20 });
 *   world.system('move', ['Position', 'Velocity'], (ents, dt) => { ... });
 */
(function(V8) {
  'use strict';

  class Component {
    constructor(type, defaults) {
      this._type = type;
      Object.assign(this, defaults || {});
    }
    get type() { return this._type; }
  }

  class Entity {
    constructor(world, id) {
      this._world = world;
      this._id = id;
      this._components = new Map();
      this._tags = new Set();
    }

    get id() { return this._id; }

    /** Set/replace a component. Returns this for chaining. */
    set(type, data) {
      const proto = this._world._prototypes.get(type);
      if (!proto) throw new Error(`Unknown component type: ${type}`);
      const comp = Object.create(proto);
      Object.assign(comp, proto); // copy defaults
      delete comp._type;
      Object.assign(comp, data);
      comp._type = type;
      this._components.set(type, comp);
      this._world._markDirty(type);
      return this;
    }

    /** Get a component by type. */
    get(type) {
      return this._components.get(type) || null;
    }

    /** Check if entity has a component. */
    has(type) {
      return this._components.has(type);
    }

    /** Remove a component. */
    remove(type) {
      this._components.delete(type);
      this._world._markDirty(type);
      return this;
    }

    /** Add a tag for filtering. */
    tag(t) { this._tags.add(t); return this; }
    hasTag(t) { return this._tags.has(t); }

    /** Destroy this entity. */
    destroy() {
      this._world._destroyEntity(this._id);
    }
  }

  class World {
    constructor() {
      this._prototypes = new Map();     // type → Component prototype
      this._entities = new Map();       // id → Entity
      this._systems = [];              // { query, fn }
      this._indices = new Map();       // type → Set<entityId>
      this._dirty = new Set();         // dirty indices
      this._nextId = 1;
    }

    /** Register a component type with default values. */
    component(type, defaults) {
      const proto = new Component(type, defaults);
      this._prototypes.set(type, proto);
      this._indices.set(type, new Set());
      return this;
    }

    /** Create a new entity. */
    entity() {
      const id = this._nextId++;
      const e = new Entity(this, id);
      this._entities.set(id, e);
      return e;
    }

    /** Get an entity by ID. */
    get(id) {
      return this._entities.get(id) || null;
    }

    /** Register a system. fn receives (entities[], dt, world). */
    system(name, queryTypes, fn) {
      this._systems.push({ name, query: queryTypes, fn });
      return this;
    }

    /** Run all systems. */
    update(dt) {
      // Rebuild dirty indices
      if (this._dirty.size > 0) {
        for (const type of this._dirty) {
          const set = this._indices.get(type);
          if (!set) continue;
          set.clear();
          for (const [id, e] of this._entities) {
            if (e.has(type)) set.add(id);
          }
        }
        this._dirty.clear();
      }

      // Run each system
      for (const sys of this._systems) {
        const entities = this._query(sys.query);
        if (entities.length > 0) sys.fn(entities, dt, this);
      }
    }

    /** Query entities matching ALL given component types. */
    _query(types) {
      if (types.length === 0) return [];
      // Start with smallest set
      let smallest = null;
      let smallestType = null;
      for (const t of types) {
        const set = this._indices.get(t);
        if (!set) return [];
        if (!smallest || set.size < smallest.size) {
          smallest = set;
          smallestType = t;
        }
      }
      const result = [];
      for (const id of smallest) {
        const e = this._entities.get(id);
        if (!e) continue;
        let match = true;
        for (const t of types) {
          if (t === smallestType) continue;
          if (!e.has(t)) { match = false; break; }
        }
        if (match) result.push(e);
      }
      return result;
    }

    /** Remove all entities. */
    clear() {
      this._entities.clear();
      for (const set of this._indices.values()) set.clear();
      this._dirty.clear();
      this._nextId = 1;
    }

    /** Mark an index dirty (called by Entity). */
    _markDirty(type) { this._dirty.add(type); }

    /** Destroy entity (called by Entity). */
    _destroyEntity(id) {
      const e = this._entities.get(id);
      if (!e) return;
      for (const [type] of e._components) {
        this._dirty.add(type);
      }
      this._entities.delete(id);
    }
  }

  V8.World = World;
})(window.V8 = window.V8 || {});
