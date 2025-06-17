import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Table_definition } from './table_definition.entity';

@Entity('column_definition')
@Unique(['name', 'table'])
export class Column_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "simple-json", nullable: true })
    default: any;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "simple-json", nullable: true })
    enumValues: any;
    @Column({ type: "boolean", nullable: false, default: false })
    isGenerated: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isHidden: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isIndex: boolean;
    @Column({ type: "boolean", nullable: true, default: true })
    isNullable: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isPrimary: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "boolean", nullable: true, default: false })
    isUnique: boolean;
    @Column({ type: "boolean", nullable: false, default: true })
    isUpdatable: boolean;
    @Column({ type: "varchar", nullable: false })
    name: string;
    @Column({ type: "text", nullable: true })
    placeholder: string;
    @Column({ type: "varchar", nullable: false })
    type: string;
    @ManyToOne('Table_definition', (rel:any) => rel.columns, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    table: Table_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
