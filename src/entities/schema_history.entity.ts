@Entity('schema_history')
export class Schema_history {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "simple-json", nullable: false })
    schema: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
