import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Role_definition } from "./role_definition.entity";
import { Route_definition } from "./route_definition.entity";

@Entity('permission_definition')
export class Permission_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "simple-json", nullable: true })
    actions: any;
    @Column({ type: "boolean", nullable: false, default: true })
    isEnabled: boolean;
    @ManyToOne(() => Role_definition, (rel) => rel.permissions, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    role: Role_definition;
    @ManyToOne(() => Route_definition, (rel) => rel.permissions, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: Route_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
