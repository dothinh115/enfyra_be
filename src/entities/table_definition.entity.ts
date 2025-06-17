import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Column_definition } from './column_definition.entity';
import { Relation_definition } from './relation_definition.entity';

@Entity('table_definition')
export class Table_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "varchar", nullable: true, unique: true })
    alias: string;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "simple-json", nullable: true })
    indexes: any;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false, unique: true })
    name: string;
    @Column({ type: "simple-json", nullable: true })
    uniques: any;
    @OneToMany('Column_definition', (rel: any) => rel.table, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    columns: any;
    @OneToMany('Relation_definition', (rel: any) => rel.sourceTable, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    relations: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
