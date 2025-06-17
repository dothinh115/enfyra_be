import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Table_definition } from './table_definition.entity';

@Entity('relation_definition')
@Unique(['propertyName', 'sourceTable'])
export class Relation_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: true })
    inversePropertyName: string;
    @Column({ type: "boolean", nullable: false, default: false })
    isEager: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isIndex: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isInverseEager: boolean;
    @Column({ type: "boolean", nullable: false, default: true })
    isNullable: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false })
    propertyName: string;
    @Column({ type: "enum", nullable: false, enum: ['one-to-one', 'many-to-one', 'one-to-many', 'many-to-many'] })
    type: 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many';
    @Index()
    @ManyToOne('Table_definition', (rel:any) => rel.relations, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    sourceTable: Table_definition;
    @Index()
    @ManyToOne('Table_definition', { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    targetTable: Table_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
