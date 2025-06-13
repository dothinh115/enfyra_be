@Entity('hook_definition')
export class Hook_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    afterHook: string;
    @Column({ type: "boolean", nullable: false, default: false })
    isEnabled: boolean;
    @Column({ type: "text", nullable: true })
    preHook: string;
    @Column({ type: "int", nullable: true, default: 0 })
    priority: number;
    @Index()
    @ManyToOne(() => Route_definition, (rel) => rel.hooks, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: Route_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
