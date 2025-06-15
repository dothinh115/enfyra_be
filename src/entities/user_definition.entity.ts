import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { HiddenField } from "../decorators/hidden-field.decorator";
import { Role_definition } from "./role_definition.entity";

@Entity('user_definition')
export class User_definition {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: false })
    email: string;
    @Column({ type: "boolean", nullable: false, default: false, update: false })
    isRootAdmin: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false })
    @HiddenField()
    password: string;
    @ManyToOne(() => Role_definition, (rel) => rel.users, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    role: Role_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
