@Entity('permission_definition')
export class Permission_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "simple-json", nullable: true })
    actions: any;
    @Column({ type: "boolean", nullable: false, default: true })
    isEnabled: boolean;
    @Index()
    @ManyToOne(() => Role_definition, (rel) => rel.permissions, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    role: Role_definition;
    @Index()
    @ManyToOne(() => Route_definition, (rel) => rel.permissions, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: Route_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
