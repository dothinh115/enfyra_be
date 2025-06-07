import fs from 'fs';
import path from 'path';

const metadata = JSON.parse(fs.readFileSync('./snapshot.json', 'utf8'));
const entityDir = path.resolve('src', 'entities');

const knownGlobalImports = {
  Column: 'typeorm',
  Entity: 'typeorm',
  OneToMany: 'typeorm',
  PrimaryGeneratedColumn: 'typeorm',
  ManyToMany: 'typeorm',
  ManyToOne: 'typeorm',
  OneToOne: 'typeorm',
  JoinTable: 'typeorm',
  JoinColumn: 'typeorm',
  Index: 'typeorm',
  Unique: 'typeorm',
  CreateDateColumn: 'typeorm',
  UpdateDateColumn: 'typeorm',
};

function capitalize(str) {
  return str?.charAt(0).toUpperCase() + str?.slice(1);
}

function dbTypeToTSType(dbType) {
  const map = {
    int: 'number',
    integer: 'number',
    smallint: 'number',
    bigint: 'number',
    decimal: 'number',
    numeric: 'number',
    float: 'number',
    double: 'number',
    real: 'number',
    boolean: 'boolean',
    bool: 'boolean',
    varchar: 'string',
    text: 'string',
    uuid: 'string',
    enum: 'string',
    'simple-json': 'any',
  };
  return map[dbType] || 'any';
}

function buildInverseRelationMap() {
  const inverseMap = new Map();

  for (const [tableName, def] of Object.entries(metadata)) {
    for (const rel of def.relations || []) {
      if (!rel.inversePropertyName) continue;

      const target = rel.targetTable;
      if (!metadata[target]) continue;

      const targetList = inverseMap.get(target) || [];
      let inverseType = 'one-to-one';
      if (rel.type === 'many-to-many') inverseType = 'many-to-many';
      else if (rel.type === 'many-to-one') inverseType = 'one-to-many';
      else if (rel.type === 'one-to-many') inverseType = 'many-to-one';

      targetList.push({
        type: inverseType,
        targetClass: capitalize(tableName),
        propertyName: rel.inversePropertyName,
        inversePropertyName: rel.propertyName,
      });

      inverseMap.set(target, targetList);
    }
  }

  return inverseMap;
}

function generateEntityCode(name, def, inverseMap) {
  const className = capitalize(name);
  const usedDecorators = new Set();

  const addDecorator = (dec) => usedDecorators.add(dec);

  let code = '';
  if (Array.isArray(def.unique) && def.unique.length) {
    const uniqueFields = def.unique.map((u) => `'${u}'`).join(', ');
    code += `@Unique([${uniqueFields}])\n`;
    addDecorator('Unique');
  }

  code += `@Entity('${name}')\n`;
  addDecorator('Entity');

  code += `export class ${className} {\n`;

  for (const col of def.columns) {
    const lines = [];

    if (col.isHidden) {
      lines.push(`  @HiddenField()`);
    }

    if (col.isPrimary && col.isGenerated) {
      const strategy = col.type === 'uuid' ? `'uuid'` : `'increment'`;
      addDecorator('PrimaryGeneratedColumn');
      lines.push(`  @PrimaryGeneratedColumn(${strategy})`);
    } else {
      addDecorator('Column');
      const options = [`type: '${col.type}'`];
      if (col.isNullable !== undefined)
        options.push(`nullable: ${col.isNullable}`);
      if (col.isUnique) options.push(`unique: true`);
      if (col.default !== undefined && col.default !== null) {
        if (typeof col.default === 'string')
          options.push(`default: '${col.default}'`);
        else options.push(`default: ${col.default}`);
      }
      if (col.type === 'enum' && Array.isArray(col.enumValues)) {
        options.push(
          `enum: [${col.enumValues.map((v) => `'${v}'`).join(', ')}]`,
        );
      }
      lines.push(`  @Column({ ${options.join(', ')} })`);
    }

    lines.push(`  ${col.name}: ${dbTypeToTSType(col.type)};\n`);
    code += lines.join('\n') + '\n';
  }

  for (const rel of def.relations || []) {
    const relType = rel.type;
    const target = capitalize(rel.targetTable);
    let decorator = '';
    let propType = target;
    const cascade = ['many-to-many', 'one-to-many'].includes(relType)
      ? ', { cascade: true, onDelete: "CASCADE", onUpdate: "CASCADE" }'
      : '';

    if (relType === 'many-to-one') {
      addDecorator('ManyToOne');
      addDecorator('JoinColumn');
      decorator = `@ManyToOne(() => ${target}${cascade})\n  @JoinColumn()`;
    } else if (relType === 'one-to-one') {
      addDecorator('OneToOne');
      addDecorator('JoinColumn');
      decorator = `@OneToOne(() => ${target}${cascade})\n  @JoinColumn()`;
    } else if (relType === 'one-to-many') {
      addDecorator('OneToMany');
      decorator = `@OneToMany(() => ${target}, x => x.${rel.inversePropertyName}${cascade})`;
      propType += '[]';
    } else if (relType === 'many-to-many') {
      addDecorator('ManyToMany');
      addDecorator('JoinTable');
      decorator = `@ManyToMany(() => ${target}${cascade})\n  @JoinTable()`;
      propType += '[]';
    }

    code += `  ${decorator}\n`;
    code += `  ${rel.propertyName}: ${propType};\n\n`;
  }

  const inverseRels = inverseMap.get(name) || [];
  for (const iRel of inverseRels) {
    const target = iRel.targetClass;
    let propType = target;
    const cascade = ['one-to-many', 'many-to-many'].includes(iRel.type)
      ? ', { cascade: true, onDelete: "CASCADE", onUpdate: "CASCADE" }'
      : '';

    let decorator = '';
    if (iRel.type === 'many-to-one') {
      addDecorator('ManyToOne');
      addDecorator('JoinColumn');
      decorator = `@ManyToOne(() => ${target}${cascade})\n  @JoinColumn()`;
    } else if (iRel.type === 'one-to-one') {
      addDecorator('OneToOne');
      addDecorator('JoinColumn');
      decorator = `@OneToOne(() => ${target}${cascade})`;
    } else if (iRel.type === 'one-to-many') {
      addDecorator('OneToMany');
      decorator = `@OneToMany(() => ${target}, x => x.${iRel.inversePropertyName}${cascade})`;
      propType += '[]';
    } else if (iRel.type === 'many-to-many') {
      addDecorator('ManyToMany');
      addDecorator('JoinTable');
      decorator = `@ManyToMany(() => ${target}${cascade})\n  @JoinTable()`;
      propType += '[]';
    }

    code += `  ${decorator}\n`;
    code += `  ${iRel.propertyName}: ${propType};\n\n`;
  }

  addDecorator('CreateDateColumn');
  addDecorator('UpdateDateColumn');
  code += `  @CreateDateColumn()\n  createdAt: Date;\n\n`;
  code += `  @UpdateDateColumn()\n  updatedAt: Date;\n`;

  code += `}\n`;

  // Build imports
  const importsByModule = new Map();

  for (const dec of usedDecorators) {
    const mod = knownGlobalImports[dec] || 'typeorm';
    if (!importsByModule.has(mod)) importsByModule.set(mod, new Set());
    importsByModule.get(mod).add(dec);
  }

  let importLines = '';
  for (const [mod, decs] of importsByModule.entries()) {
    importLines += `import { ${Array.from(decs).sort().join(', ')} } from '${mod}';\n`;
  }
  importLines += '\n';

  return importLines + code;
}

function writeEntities() {
  if (!fs.existsSync(entityDir)) fs.mkdirSync(entityDir, { recursive: true });

  const inverseMap = buildInverseRelationMap();

  for (const [name, def] of Object.entries(metadata)) {
    const content = generateEntityCode(name, def, inverseMap);
    const filename = path.resolve(entityDir, `${name}.entity.ts`);
    fs.writeFileSync(filename, content);
    console.log('✔ Generated', filename);
  }
}

writeEntities();
