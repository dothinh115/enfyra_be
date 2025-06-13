@Entity('table_definition')
export class Table_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "varchar", nullable: true, unique: true })
    alias: string;
    @Column({ type: "simple-json", nullable: true })
    indexes: any;
    @Column({ type: "boolean", nullable: false, default: false })
    isStatic: boolean;
    @Column({ type: "varchar", nullable: false, unique: true })
    name: string;
    @Column({ type: "simple-json", nullable: true })
    uniques: any;
    @OneToMany(() => Column_definition, (rel) => rel.table, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    columns: Column_definition[];
    @OneToMany(() => Relation_definition, (rel) => rel.sourceTable, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    relations: Relation_definition[];
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
