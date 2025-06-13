@Entity('role_definition')
export class Role_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "varchar", nullable: false, unique: true })
    name: string;
    @OneToMany(() => User_definition, (rel) => rel.role, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    users: User_definition[];
    @OneToMany(() => Permission_definition, (rel) => rel.role, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    permissions: Permission_definition[];
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
